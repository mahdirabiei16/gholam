import { Character, GameDefinition, GameModeId, HealthStatus } from '../types/app';

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error || 'خطای ارتباط با سرور.';
    throw new Error(msg);
  }
  return data as T;
}

export const apiClient = {
  async getHealth(): Promise<HealthStatus> {
    const res = await fetch('/api/health');
    return parseJsonOrThrow<HealthStatus>(res);
  },

  async getCharacters(): Promise<Character[]> {
    const res = await fetch('/api/characters');
    const data = await parseJsonOrThrow<{ characters: Character[] }>(res);
    return data.characters;
  },

  async getGames(): Promise<GameDefinition[]> {
    const res = await fetch('/api/games');
    const data = await parseJsonOrThrow<{ games: GameDefinition[] }>(res);
    return data.games;
  },

  async transcribeAudio(params: {
    audioBase64: string;
    mimeType: string;
  }): Promise<{ transcript: string }> {
    const res = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return parseJsonOrThrow(res);
  },

  async synthesizeSpeech(params: {
    text: string;
    characterId: string;
  }): Promise<{ audioBase64: string; mimeType: string }> {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return parseJsonOrThrow(res);
  },

  async sendVoiceTurn(params: {
    sessionId: string;
    characterId: string;
    userText?: string;
    audioBase64?: string;
    audioMimeType?: string;
  }): Promise<{
    userText: string;
    replyText: string;
    audioBase64: string;
    mimeType: string;
    characterId: string;
  }> {
    const res = await fetch('/api/chat/voice-turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return parseJsonOrThrow(res);
  },

  async startGame(params: {
    sessionId: string;
    gameId: GameModeId;
    characterId?: string;
    topic?: string;
  }): Promise<{
    replyText: string;
    audioBase64: string;
    mimeType: string;
    characterId: string;
    gameId: GameModeId;
  }> {
    const res = await fetch('/api/games/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return parseJsonOrThrow(res);
  },

  async sendGameTurn(params: {
    sessionId: string;
    gameId: GameModeId;
    characterId: string;
    topic?: string;
    userText?: string;
    audioBase64?: string;
    audioMimeType?: string;
  }): Promise<{
    userText: string;
    replyText: string;
    audioBase64: string;
    mimeType: string;
    characterId: string;
    gameId: GameModeId;
  }> {
    const res = await fetch('/api/games/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return parseJsonOrThrow(res);
  },

  async streamAssistantReply(params: {
    message: string;
    personaId: string;
    history: Array<{ role: 'user' | 'model'; text: string }>;
    signal?: AbortSignal;
    onChunk: (chunk: string) => void;
  }): Promise<void> {
    const res = await fetch('/api/assistant/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: params.message,
        personaId: params.personaId,
        history: params.history,
      }),
      signal: params.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || 'خطا در ارتباط با سرور.');
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('پاسخ جریانی از سرور در دسترس نیست.');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const evt of events) {
        const line = evt
          .split('\n')
          .find((l) => l.startsWith('data: '));
        if (!line) continue;

        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        const payload = JSON.parse(jsonStr) as {
          chunk?: string;
          done?: boolean;
          error?: string;
        };
        if (payload.error) {
          throw new Error(payload.error);
        }
        if (payload.chunk) {
          params.onChunk(payload.chunk);
        }
      }
    }
  },

  async resetMemory(sessionId: string, contextId: string): Promise<void> {
    const res = await fetch('/api/memory/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, contextId }),
    });
    await parseJsonOrThrow(res);
  },
};
