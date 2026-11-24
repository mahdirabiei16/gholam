export type ScreenTab = 'chat' | 'assistant' | 'characters' | 'games';
export type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';
export type VoiceInteractionMode = 'realtime' | 'turn';
export type GameModeId = 'taha' | 'jaro-bahs';

export interface Character {
  id: string;
  name: string;
  shortRole: string;
  personalityDescription: string;
  voiceDescription: string;
  accentColor: string;
  avatarUrl: string;
  greetingPrompt: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
  audioBase64?: string;
  mimeType?: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  personaId: string;
}

export interface AssistantThread {
  id: string;
  title: string;
  personaId: string;
  updatedAt: number;
  messages: AssistantMessage[];
}

export interface HealthStatus {
  ok: boolean;
  configured: boolean;
  provider: string;
  missingReason: string | null;
}

export interface GameDefinition {
  id: GameModeId;
  title: string;
  subtitle: string;
  defaultCharacterId: string;
}
