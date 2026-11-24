import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { serverConfig } from '../config/env.js';
import { ensureWavBuffer } from '../utils/audioWav.js';
import {
  AiProvider,
  GenerateReplyParams,
  SynthesizeSpeechParams,
  SynthesizeSpeechResult,
  TranscribeAudioParams,
} from './types.js';

function isTransientError(err: unknown): boolean {
  const status = typeof (err as { status?: unknown })?.status === 'number'
    ? (err as { status: number }).status
    : undefined;
  const text = err instanceof Error ? err.message : String(err);
  return status === 503 || status === 500 || status === 429 || text.includes('UNAVAILABLE') || text.includes('RESOURCE_EXHAUSTED');
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isTransientError(err)) {
        throw err;
      }
      const delayMs = 800 * Math.pow(2, attempt);
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  async generateReply({
    systemPrompt,
    history,
    userMessage,
  }: GenerateReplyParams): Promise<string> {
    const contents = [
      ...history.map((turn) => ({
        role: turn.role,
        parts: [{ text: turn.text }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: userMessage }],
      },
    ];

    let response;
    try {
      response = await withRetry(() =>
        this.client.models.generateContent({
          model: serverConfig.geminiChatModel,
          contents,
          config: {
            systemInstruction: systemPrompt,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );
    } catch (err) {
      if (!isTransientError(err)) {
        throw err;
      }
      console.warn('Primary chat model unavailable, falling back to gemini-3.1-flash-lite');
      response = await this.client.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents,
        config: {
          systemInstruction: systemPrompt,
        },
      });
    }

    const reply = response.text?.trim();
    if (!reply) {
      throw new Error('مدل هوش مصنوعی پاسخی برنگرداند.');
    }
    return reply;
  }

  async *streamReply({
    systemPrompt,
    history,
    userMessage,
  }: GenerateReplyParams): AsyncGenerator<string> {
    const contents = [
      ...history.map((turn) => ({
        role: turn.role,
        parts: [{ text: turn.text }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: userMessage }],
      },
    ];

    let streamResponse;
    try {
      streamResponse = await this.client.models.generateContentStream({
        model: serverConfig.geminiChatModel,
        contents,
        config: {
          systemInstruction: systemPrompt,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
    } catch (err) {
      if (!isTransientError(err)) {
        throw err;
      }
      streamResponse = await this.client.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        contents,
        config: {
          systemInstruction: systemPrompt,
        },
      });
    }

    for await (const chunk of streamResponse) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  }

  private async requestTts(
    cleanText: string,
    voiceName: string,
    modelName: string
  ): Promise<SynthesizeSpeechResult> {
    const response = await withRetry(() =>
      this.client.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [{ text: cleanText }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      })
    );

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const audioPart = parts.find((part) => part.inlineData?.data);

    if (!audioPart?.inlineData?.data) {
      throw new Error('تبدیل متن به گفتار انجام نشد.');
    }

    const rawBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
    const wav = ensureWavBuffer(rawBuffer, audioPart.inlineData.mimeType);

    return {
      audioBuffer: wav.buffer,
      mimeType: wav.mimeType,
    };
  }

  async synthesizeSpeech({
    text,
    voiceName,
    fallbackVoiceName,
  }: SynthesizeSpeechParams): Promise<SynthesizeSpeechResult> {
    const cleanText = text.replace(/[*_`#•\-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) {
      throw new Error('متن معتبری برای تبدیل به گفتار وجود ندارد.');
    }

    try {
      return await this.requestTts(cleanText, voiceName, serverConfig.geminiTtsModel);
    } catch (err) {
      if (fallbackVoiceName && fallbackVoiceName !== voiceName) {
        return await this.requestTts(cleanText, fallbackVoiceName, serverConfig.geminiTtsModel);
      }
      throw err;
    }
  }

  async transcribeAudio({
    audioBuffer,
    mimeType,
  }: TranscribeAudioParams): Promise<string> {
    const normalizedMime = mimeType.split(';')[0].trim().toLowerCase() || 'audio/webm';

    const response = await withRetry(() =>
      this.client.models.generateContent({
        model: serverConfig.geminiSttModel,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: normalizedMime,
                data: audioBuffer.toString('base64'),
              },
            },
            {
              text: 'فقط متن دقیق گفتار فارسی داخل این فایل صوتی را بنویس. اگر صدایی نیست یا قابل تشخیص نیست، فقط یک رشته خالی برگردان. هیچ توضیح اضافه‌ای ننویس.',
            },
          ],
        },
      })
    );

    return (response.text || '').trim();
  }
}
