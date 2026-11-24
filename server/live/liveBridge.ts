import http from 'http';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { WebSocket, WebSocketServer } from 'ws';
import { serverConfig, isAiConfigured } from '../config/env.js';
import { getCharacterById, CHARACTERS } from '../characters/characters.js';
import { GAMES, GameModeId, resolveGameCharacter } from '../games/gameEngine.js';

function buildLiveSystemInstruction(params: {
  mode: string;
  characterId?: string;
  gameId?: string;
  topic?: string;
}): { systemInstruction: string; voiceName: string; resolvedCharacterId: string } {
  const { mode, characterId, gameId, topic } = params;

  if (mode === 'game' && gameId && gameId in GAMES) {
    const typedGameId = gameId as GameModeId;
    const game = GAMES[typedGameId];
    const character = resolveGameCharacter(typedGameId, characterId);
    const liveInstruction = `
${game.buildSystemInstruction(character, topic)}

نکته مکالمه زنده (Real-Time):
- این مکالمه کاملاً زنده و صوتی است. کوتاه، پرانرژی، سریع و طبیعی به فارسی محاوره‌ای صحبت کن.
- اگر کاربر وسط حرفت آمد، بلافاصله حرفش را بشنو و با همان لحن ادامه بده.
`;
    return {
      systemInstruction: liveInstruction,
      voiceName: character.fallbackVoiceName || character.voiceName,
      resolvedCharacterId: character.id,
    };
  }

  const character = getCharacterById(characterId || '') || CHARACTERS[0];
  const liveInstruction = `
${character.systemPrompt}

نکته مکالمه زنده (Real-Time):
- تو الان در یک تماس صوتی زنده و مستقیم با کاربر هستی.
- مکالمه را کاملاً طبیعی، سریع و محاوره‌ای به فارسی پیش ببر (پاسخ‌های کوتاه ۱ تا ۲ جمله‌ای بده تا گفتگو روان و واقعی بماند).
- فقط وقتی مکالمه تازه شروع شد، یک سلام کوتاه و گرم به سبک خودت بگو.
`;

  return {
    systemInstruction: liveInstruction,
    voiceName: character.fallbackVoiceName || character.voiceName,
    resolvedCharacterId: character.id,
  };
}

export function attachLiveWebSocketServer(httpServer: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/ws/live') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
    if (!isAiConfigured()) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          message: 'کلید GEMINI_API_KEY روی سرور تنظیم نشده است.',
        })
      );
      clientWs.close();
      return;
    }

    const url = new URL(req.url || '/', 'http://localhost');
    const mode = url.searchParams.get('mode') || 'chat';
    const characterId = url.searchParams.get('characterId') || undefined;
    const gameId = url.searchParams.get('gameId') || undefined;
    const topic = url.searchParams.get('topic')?.slice(0, 200) || undefined;

    const { systemInstruction, voiceName, resolvedCharacterId } = buildLiveSystemInstruction({
      mode,
      characterId,
      gameId,
      topic,
    });

    const ai = new GoogleGenAI({
      apiKey: serverConfig.geminiApiKey,
      apiVersion: 'v1beta',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let closed = false;

    try {
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction,
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (closed || clientWs.readyState !== WebSocket.OPEN) return;

            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: 'inputTranscript',
                  text: content.inputTranscription.text,
                })
              );
            }

            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: 'outputTranscript',
                  text: content.outputTranscription.text,
                })
              );
            }

            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    type: 'audio',
                    data: part.inlineData.data,
                  })
                );
              }
            }

            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }

            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ type: 'turnComplete' }));
            }
          },
          onerror: (err: unknown) => {
            console.error('Gemini Live error:', err);
            if (!closed && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'error',
                  message: 'اتصال صوتی زنده با خطا مواجه شد. لطفاً دوباره امتحان کنید.',
                })
              );
              clientWs.close();
            }
          },
          onclose: (evt: { reason?: string; code?: number }) => {
            if (!closed && clientWs.readyState === WebSocket.OPEN) {
              if (evt?.code && evt.code !== 1000) {
                console.warn('Gemini Live closed:', evt.code, evt.reason);
              }
              clientWs.send(JSON.stringify({ type: 'closed' }));
              clientWs.close();
            }
          },
        },
      });

      if (!closed && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'ready',
            characterId: resolvedCharacterId,
          })
        );
      }
    } catch (err) {
      console.error('Failed to open Gemini Live session:', err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            message: 'امکان برقراری تماس زنده با مدل هوش مصنوعی وجود ندارد.',
          })
        );
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession || closed) return;
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          data?: string;
          text?: string;
        };

        if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
          liveSession.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [{ text: msg.text.trim().slice(0, 1500) }],
              },
            ],
            turnComplete: true,
          });
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    clientWs.on('close', () => {
      closed = true;
      try {
        liveSession?.close();
      } catch {
        // ignore
      }
      liveSession = null;
    });
  });
}
