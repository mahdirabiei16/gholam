import { Router, Request, Response } from 'express';
import { serverConfig, isAiConfigured } from '../config/env.js';
import { CHARACTERS, getCharacterById } from '../characters/characters.js';
import { GAMES, GameModeId, resolveGameCharacter } from '../games/gameEngine.js';
import { conversationStore } from '../memory/conversationStore.js';
import { GeminiProvider } from '../providers/geminiProvider.js';
import { AiProvider } from '../providers/types.js';

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
]);

function isValidAudioMime(mimeType: string): boolean {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return ALLOWED_AUDIO_MIMES.has(base);
}

function sanitizeSessionId(value: unknown): string {
  if (typeof value !== 'string') return 'default';
  const cleaned = value.trim().slice(0, 64);
  return /^[a-zA-Z0-9_-]+$/.test(cleaned) ? cleaned : 'default';
}

function createProvider(): AiProvider | null {
  if (!isAiConfigured()) return null;
  return new GeminiProvider(serverConfig.geminiApiKey);
}

function mapGeminiError(err: unknown, fallbackMessage: string): { status: number; message: string } {
  const status = typeof (err as { status?: unknown })?.status === 'number'
    ? (err as { status: number }).status
    : undefined;
  const text = err instanceof Error ? err.message : String(err);

  if (
    status === 403 ||
    status === 401 ||
    text.includes('API_KEY_INVALID') ||
    text.includes('PERMISSION_DENIED') ||
    text.includes('ACCESS_DENIED')
  ) {
    return {
      status: 502,
      message: 'کلید Gemini معتبر نیست یا مجوز لازم را ندارد. کلید را در بخش Secrets بررسی کنید.',
    };
  }
  if (status === 429 || text.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'سقف درخواست‌های سرویس هوش مصنوعی موقتاً پر شده است. لطفاً کمی صبر کنید.',
    };
  }
  if (status === 404 || text.includes('NOT_FOUND')) {
    return {
      status: 502,
      message: 'مدل هوش مصنوعی درخواستی یافت نشد یا در دسترس نیست.',
    };
  }
  if (status === 503 || text.includes('UNAVAILABLE')) {
    return {
      status: 503,
      message: 'سرور هوش مصنوعی موقتاً شلوغ است؛ لطفاً چند ثانیه دیگر دوباره امتحان کنید.',
    };
  }
  if (status === 400) {
    return {
      status: 400,
      message: `درخواست نامعتبر برای سرویس هوش مصنوعی: ${text.slice(0, 180)}`,
    };
  }
  return {
    status: 500,
    message: fallbackMessage,
  };
}

export const apiRouter = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    configured: isAiConfigured(),
    provider: serverConfig.aiProvider,
    missingReason: isAiConfigured()
      ? null
      : 'کلید GEMINI_API_KEY در تنظیمات Secrets سرور پیکربندی نشده است.',
  });
});

apiRouter.get('/characters', (_req: Request, res: Response) => {
  res.json({
    characters: CHARACTERS.map((c) => ({
      id: c.id,
      name: c.name,
      shortRole: c.shortRole,
      personalityDescription: c.personalityDescription,
      voiceDescription: c.voiceDescription,
      accentColor: c.accentColor,
      avatarUrl: c.avatarUrl,
      greetingPrompt: c.greetingPrompt,
    })),
  });
});

apiRouter.get('/games', (_req: Request, res: Response) => {
  res.json({
    games: Object.values(GAMES).map((g) => ({
      id: g.id,
      title: g.title,
      subtitle: g.subtitle,
      defaultCharacterId: g.defaultCharacterId,
    })),
  });
});

apiRouter.post('/stt', async (req: Request, res: Response) => {
  const provider = createProvider();
  if (!provider) {
    res.status(503).json({ error: 'سرویس هوش مصنوعی پیکربندی نشده است.' });
    return;
  }

  try {
    const { audioBase64, mimeType } = req.body as {
      audioBase64?: unknown;
      mimeType?: unknown;
    };
    if (
      typeof audioBase64 !== 'string' ||
      typeof mimeType !== 'string' ||
      !audioBase64.trim() ||
      !isValidAudioMime(mimeType)
    ) {
      res.status(400).json({ error: 'فایل صوتی معتبر ارسال نشده است.' });
      return;
    }

    const transcript = await provider.transcribeAudio({
      audioBuffer: Buffer.from(audioBase64, 'base64'),
      mimeType,
    });

    res.json({ transcript });
  } catch (err) {
    console.error('STT error:', err);
    const mapped = mapGeminiError(err, 'خطا در تشخیص گفتار فارسی. لطفاً دوباره تلاش کنید.');
    res.status(mapped.status).json({ error: mapped.message });
  }
});

apiRouter.post('/tts', async (req: Request, res: Response) => {
  const provider = createProvider();
  if (!provider) {
    res.status(503).json({ error: 'سرویس هوش مصنوعی پیکربندی نشده است.' });
    return;
  }

  try {
    const { text, characterId } = req.body as {
      text?: unknown;
      characterId?: unknown;
    };
    const character = typeof characterId === 'string' ? getCharacterById(characterId) : undefined;
    if (typeof text !== 'string' || !text.trim() || !character) {
      res.status(400).json({ error: 'متن یا شخصیت معتبر نیست.' });
      return;
    }

    const speech = await provider.synthesizeSpeech({
      text: text.trim().slice(0, 1200),
      voiceName: character.voiceName,
      fallbackVoiceName: character.fallbackVoiceName,
      voiceStyle: character.voiceStyle,
    });

    res.json({
      audioBase64: speech.audioBuffer.toString('base64'),
      mimeType: speech.mimeType,
    });
  } catch (err) {
    console.error('TTS error:', err);
    const mapped = mapGeminiError(err, 'خطا در تولید صدای شخصیت. لطفاً دوباره تلاش کنید.');
    res.status(mapped.status).json({ error: mapped.message });
  }
});

apiRouter.post('/chat/voice-turn', async (req: Request, res: Response) => {
  const provider = createProvider();
  if (!provider) {
    res.status(503).json({ error: 'کلید GEMINI_API_KEY روی سرور تنظیم نشده است.' });
    return;
  }

  try {
    const {
      sessionId: rawSessionId,
      characterId,
      userText,
      audioBase64,
      audioMimeType,
    } = req.body as {
      sessionId?: unknown;
      characterId?: unknown;
      userText?: unknown;
      audioBase64?: unknown;
      audioMimeType?: unknown;
    };

    const sessionId = sanitizeSessionId(rawSessionId);
    const character = typeof characterId === 'string' ? getCharacterById(characterId) : undefined;
    if (!character) {
      res.status(400).json({ error: 'شخصیت انتخاب‌شده پیدا نشد.' });
      return;
    }

    let finalUserText = typeof userText === 'string' ? userText.trim().slice(0, 1500) : '';
    if (
      !finalUserText &&
      typeof audioBase64 === 'string' &&
      audioBase64.trim() &&
      typeof audioMimeType === 'string' &&
      isValidAudioMime(audioMimeType)
    ) {
      finalUserText = await provider.transcribeAudio({
        audioBuffer: Buffer.from(audioBase64, 'base64'),
        mimeType: audioMimeType,
      });
    }

    if (!finalUserText) {
      res.status(400).json({
        error: 'صدایی تشخیص داده نشد. لطفاً واضح‌تر در میکروفون صحبت کنید.',
      });
      return;
    }

    const contextId = `char:${character.id}`;
    const history = conversationStore.getHistory(sessionId, contextId);

    const replyText = await provider.generateReply({
      systemPrompt: character.systemPrompt,
      history,
      userMessage: finalUserText,
    });

    conversationStore.appendTurn(sessionId, contextId, {
      role: 'user',
      text: finalUserText,
      timestamp: Date.now(),
    });
    conversationStore.appendTurn(sessionId, contextId, {
      role: 'model',
      text: replyText,
      timestamp: Date.now(),
    });

    const speech = await provider.synthesizeSpeech({
      text: replyText,
      voiceName: character.voiceName,
      fallbackVoiceName: character.fallbackVoiceName,
      voiceStyle: character.voiceStyle,
    });

    res.json({
      userText: finalUserText,
      replyText,
      audioBase64: speech.audioBuffer.toString('base64'),
      mimeType: speech.mimeType,
      characterId: character.id,
    });
  } catch (err) {
    console.error('Voice turn error:', err);
    const mapped = mapGeminiError(
      err,
      'ارتباط با هوش مصنوعی با خطا مواجه شد. لطفاً دوباره امتحان کنید.'
    );
    res.status(mapped.status).json({ error: mapped.message });
  }
});

apiRouter.post('/games/start', async (req: Request, res: Response) => {
  const provider = createProvider();
  if (!provider) {
    res.status(503).json({ error: 'کلید GEMINI_API_KEY روی سرور تنظیم نشده است.' });
    return;
  }

  try {
    const {
      sessionId: rawSessionId,
      gameId,
      characterId,
      topic,
    } = req.body as {
      sessionId?: unknown;
      gameId?: unknown;
      characterId?: unknown;
      topic?: unknown;
    };

    const sessionId = sanitizeSessionId(rawSessionId);
    if (typeof gameId !== 'string' || !(gameId in GAMES)) {
      res.status(400).json({ error: 'بازی انتخاب‌شده معتبر نیست.' });
      return;
    }

    const typedGameId = gameId as GameModeId;
    const game = GAMES[typedGameId];
    const character = resolveGameCharacter(
      typedGameId,
      typeof characterId === 'string' ? characterId : undefined
    );
    const cleanTopic = typeof topic === 'string' ? topic.trim().slice(0, 200) : undefined;
    const contextId = `game:${typedGameId}:${character.id}`;

    conversationStore.clear(sessionId, contextId);

    const systemPrompt = game.buildSystemInstruction(character, cleanTopic);
    const openingText = await provider.generateReply({
      systemPrompt,
      history: [],
      userMessage: cleanTopic
        ? `بازی رو با این موضوع شروع کن: ${cleanTopic}`
        : game.starterPrompt,
    });

    conversationStore.appendTurn(sessionId, contextId, {
      role: 'model',
      text: openingText,
      timestamp: Date.now(),
    });

    const speech = await provider.synthesizeSpeech({
      text: openingText,
      voiceName: character.voiceName,
      fallbackVoiceName: character.fallbackVoiceName,
      voiceStyle: character.voiceStyle,
    });

    res.json({
      replyText: openingText,
      audioBase64: speech.audioBuffer.toString('base64'),
      mimeType: speech.mimeType,
      characterId: character.id,
      gameId: typedGameId,
    });
  } catch (err) {
    console.error('Game start error:', err);
    const mapped = mapGeminiError(err, 'خطا در شروع بازی صوتی.');
    res.status(mapped.status).json({ error: mapped.message });
  }
});

apiRouter.post('/games/turn', async (req: Request, res: Response) => {
  const provider = createProvider();
  if (!provider) {
    res.status(503).json({ error: 'کلید GEMINI_API_KEY روی سرور تنظیم نشده است.' });
    return;
  }

  try {
    const {
      sessionId: rawSessionId,
      gameId,
      characterId,
      topic,
      userText,
      audioBase64,
      audioMimeType,
    } = req.body as {
      sessionId?: unknown;
      gameId?: unknown;
      characterId?: unknown;
      topic?: unknown;
      userText?: unknown;
      audioBase64?: unknown;
      audioMimeType?: unknown;
    };

    const sessionId = sanitizeSessionId(rawSessionId);
    if (typeof gameId !== 'string' || !(gameId in GAMES)) {
      res.status(400).json({ error: 'بازی معتبر نیست.' });
      return;
    }

    const typedGameId = gameId as GameModeId;
    const game = GAMES[typedGameId];
    const character = resolveGameCharacter(
      typedGameId,
      typeof characterId === 'string' ? characterId : undefined
    );
    const cleanTopic = typeof topic === 'string' ? topic.trim().slice(0, 200) : undefined;
    const contextId = `game:${typedGameId}:${character.id}`;

    let finalUserText = typeof userText === 'string' ? userText.trim().slice(0, 1500) : '';
    if (
      !finalUserText &&
      typeof audioBase64 === 'string' &&
      audioBase64.trim() &&
      typeof audioMimeType === 'string' &&
      isValidAudioMime(audioMimeType)
    ) {
      finalUserText = await provider.transcribeAudio({
        audioBuffer: Buffer.from(audioBase64, 'base64'),
        mimeType: audioMimeType,
      });
    }

    if (!finalUserText) {
      res.status(400).json({ error: 'صدایی تشخیص داده نشد. دوباره صحبت کنید.' });
      return;
    }

    const history = conversationStore.getHistory(sessionId, contextId);
    const replyText = await provider.generateReply({
      systemPrompt: game.buildSystemInstruction(character, cleanTopic),
      history,
      userMessage: finalUserText,
    });

    conversationStore.appendTurn(sessionId, contextId, {
      role: 'user',
      text: finalUserText,
      timestamp: Date.now(),
    });
    conversationStore.appendTurn(sessionId, contextId, {
      role: 'model',
      text: replyText,
      timestamp: Date.now(),
    });

    const speech = await provider.synthesizeSpeech({
      text: replyText,
      voiceName: character.voiceName,
      fallbackVoiceName: character.fallbackVoiceName,
      voiceStyle: character.voiceStyle,
    });

    res.json({
      userText: finalUserText,
      replyText,
      audioBase64: speech.audioBuffer.toString('base64'),
      mimeType: speech.mimeType,
      characterId: character.id,
      gameId: typedGameId,
    });
  } catch (err) {
    console.error('Game turn error:', err);
    const mapped = mapGeminiError(err, 'خطا در ادامه بازی.');
    res.status(mapped.status).json({ error: mapped.message });
  }
});

const ASSISTANT_SYSTEM_PROMPT = `
تو یک دستیار هوشمند همه‌کاره و دقیق به زبان فارسی (و در صورت نیاز انگلیسی) هستی؛ شبیه بهترین دستیارهای گفتگو مثل ChatGPT.
- به سوالات علمی، برنامه‌نویسی، نویسندگی، ترجمه، تحلیل، ایده‌پردازی و کارهای روزمره با دقت، ساختار منظم و لحن روان و صمیمی پاسخ بده.
- از مارک‌داون استاندارد (تیترها، فهرست‌ها، متن پررنگ و بلاک کد با نام زبان مثل \`\`\`ts) برای خوانایی بهتر استفاده کن.
- پاسخ‌ها را شفاف، مستقیم و کاربردی بنویس و از حاشیه‌روی اضافه پرهیز کن.
`;

apiRouter.post('/assistant/stream', async (req: Request, res: Response) => {
  const provider = createProvider();
  if (!provider) {
    res.status(503).json({ error: 'کلید GEMINI_API_KEY روی سرور تنظیم نشده است.' });
    return;
  }

  const { message, personaId, history } = req.body as {
    message?: unknown;
    personaId?: unknown;
    history?: unknown;
  };

  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'پیام معتبری ارسال نشده است.' });
    return;
  }

  const cleanMessage = message.trim().slice(0, 4000);
  const selectedPersona = typeof personaId === 'string' ? personaId.trim() : 'assistant';
  const character = selectedPersona !== 'assistant' ? getCharacterById(selectedPersona) : undefined;

  const systemPrompt = character
    ? `${character.systemPrompt}\nدر این بخش گفتگو به صورت متنی (چت) است؛ پس با حفظ کامل شخصیت و لحن خودت، در صورت نیاز می‌توانی پاسخ‌های کامل‌تر و ساختاریافته‌تری بدهی.`
    : ASSISTANT_SYSTEM_PROMPT;

  const safeHistory: Array<{ role: 'user' | 'model'; text: string; timestamp: number }> = [];
  if (Array.isArray(history)) {
    for (const item of history.slice(-24)) {
      if (
        item &&
        typeof item === 'object' &&
        ('role' in item && (item.role === 'user' || item.role === 'model')) &&
        'text' in item &&
        typeof item.text === 'string' &&
        item.text.trim()
      ) {
        safeHistory.push({
          role: item.role,
          text: item.text.slice(0, 4000),
          timestamp: Date.now(),
        });
      }
    }
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    for await (const chunk of provider.streamReply({
      systemPrompt,
      history: safeHistory,
      userMessage: cleanMessage,
    })) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Assistant stream error:', err);
    const mapped = mapGeminiError(err, 'خطا در دریافت پاسخ هوشمند.');
    res.write(`data: ${JSON.stringify({ error: mapped.message })}\n\n`);
    res.end();
  }
});

apiRouter.post('/memory/reset', (req: Request, res: Response) => {
  const { sessionId: rawSessionId, contextId } = req.body as {
    sessionId?: unknown;
    contextId?: unknown;
  };
  if (typeof contextId !== 'string' || !contextId.trim()) {
    res.status(400).json({ error: 'شناسه گفتگو ارسال نشده است.' });
    return;
  }
  const sessionId = sanitizeSessionId(rawSessionId);
  conversationStore.clear(sessionId, contextId.trim().slice(0, 128));
  res.json({ ok: true });
});
