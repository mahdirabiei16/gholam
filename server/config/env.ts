import dotenv from 'dotenv';

dotenv.config();

export interface ServerConfig {
  port: number;
  aiProvider: 'gemini';
  geminiApiKey: string;
  geminiChatModel: string;
  geminiSttModel: string;
  geminiTtsModel: string;
}

export const serverConfig: ServerConfig = {
  port: Number(process.env.PORT || 3000),
  aiProvider: 'gemini',
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiChatModel: (process.env.GEMINI_CHAT_MODEL || 'gemini-4-hydrogen').trim(),
  geminiSttModel: (process.env.GEMINI_STT_MODEL || 'gemini-3.5-transcribe').trim(),
  geminiTtsModel: (process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-lite-tts').trim(),
};

export function isAiConfigured(): boolean {
  const key = serverConfig.geminiApiKey;
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key !== 'your_google_ai_studio_api_key_here');
}
