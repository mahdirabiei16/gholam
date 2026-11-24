import { ChatTurn } from '../memory/conversationStore.js';

export interface GenerateReplyParams {
  systemPrompt: string;
  history: ChatTurn[];
  userMessage: string;
}

export interface SynthesizeSpeechParams {
  text: string;
  voiceName: string;
  fallbackVoiceName: string;
  voiceStyle: string;
}

export interface SynthesizeSpeechResult {
  audioBuffer: Buffer;
  mimeType: string;
}

export interface TranscribeAudioParams {
  audioBuffer: Buffer;
  mimeType: string;
}

export interface AiProvider {
  readonly name: string;
  generateReply(params: GenerateReplyParams): Promise<string>;
  streamReply(params: GenerateReplyParams): AsyncGenerator<string>;
  synthesizeSpeech(params: SynthesizeSpeechParams): Promise<SynthesizeSpeechResult>;
  transcribeAudio(params: TranscribeAudioParams): Promise<string>;
}
