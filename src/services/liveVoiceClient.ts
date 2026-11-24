import { GameModeId, VoiceState } from '../types/app';

export interface LiveSessionOptions {
  mode: 'chat' | 'game';
  characterId: string;
  gameId?: GameModeId;
  topic?: string;
  initialPrompt?: string;
  echoGuard?: boolean;
  onStateChange: (state: VoiceState) => void;
  onInputTranscript: (text: string) => void;
  onOutputTranscript: (text: string) => void;
  onTurnComplete: () => void;
  onError: (message: string) => void;
}

function downsampleBuffer(
  buffer: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number
): Float32Array {
  if (inputSampleRate === targetSampleRate) {
    return buffer;
  }
  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function floatTo16BitPcmBase64(floatSamples: Float32Array): string {
  const pcm = new Int16Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i += 1) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

const ECHO_TAIL_COOLDOWN_MS = 650;
const MODEL_TURN_SAFETY_MS = 8000;

export class LiveVoiceClient {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private inputFreq: Uint8Array<ArrayBuffer> | null = null;
  private outputFreq: Uint8Array<ArrayBuffer> | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private muteGain: GainNode | null = null;

  private activeSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private isPlayingAudio = false;
  private isConnected = false;
  private echoGuard = true;
  private isModelGenerating = false;
  private modelGeneratingDeadline = 0;
  private awaitingTurnComplete = false;
  private suppressCurrentTurn = false;
  private echoCooldownUntil = 0;
  private cooldownTimer: number | null = null;
  private micGatedSince = 0;
  private hasSentMicAudioSinceTurn = false;
  private options: LiveSessionOptions | null = null;

  private isMicGated(): boolean {
    if (!this.echoGuard) return false;
    const now = performance.now();
    if (this.isModelGenerating && now >= this.modelGeneratingDeadline) {
      this.isModelGenerating = false;
    }
    const gated = this.isPlayingAudio || this.isModelGenerating || now < this.echoCooldownUntil;
    if (gated && this.micGatedSince === 0) {
      this.micGatedSince = now;
    } else if (!gated) {
      this.micGatedSince = 0;
    }
    return gated;
  }

  private clearCooldownTimer(): void {
    if (this.cooldownTimer !== null) {
      window.clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  setEchoGuard(enabled: boolean): void {
    this.echoGuard = enabled;
    if (!enabled) {
      this.echoCooldownUntil = 0;
      this.micGatedSince = 0;
      this.clearCooldownTimer();
      if (this.isConnected && !this.isPlayingAudio) {
        this.options?.onStateChange('listening');
      }
    }
  }

  interrupt(): void {
    if (!this.isConnected) return;
    this.clearPlaybackQueue();
    this.clearCooldownTimer();
    this.isModelGenerating = false;
    this.echoCooldownUntil = 0;
    this.micGatedSince = 0;
    if (this.awaitingTurnComplete) {
      this.suppressCurrentTurn = true;
    }
    this.options?.onStateChange('listening');
  }

  async start(options: LiveSessionOptions): Promise<void> {
    this.stop();
    this.options = options;
    this.echoGuard = options.echoGuard ?? true;
    options.onStateChange('connecting');

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('مرورگر شما از دسترسی به میکروفون پشتیبانی نمی‌کند.');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      const domErr = err as DOMException;
      if (domErr?.name === 'NotAllowedError' || domErr?.name === 'PermissionDeniedError') {
        throw new Error(
          'دسترسی به میکروفون رد شد. لطفاً اجازه میکروفون را از تنظیمات مرورگر فعال کنید.'
        );
      }
      throw new Error('میکروفون پیدا نشد یا امکان ضبط صدا وجود ندارد.');
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    this.inputCtx = new AudioCtx({ sampleRate: 16000 });
    this.outputCtx = new AudioCtx({ sampleRate: 24000 });

    if (this.inputCtx.state === 'suspended') await this.inputCtx.resume();
    if (this.outputCtx.state === 'suspended') await this.outputCtx.resume();

    this.inputAnalyser = this.inputCtx.createAnalyser();
    this.inputAnalyser.fftSize = 64;
    this.inputFreq = new Uint8Array(new ArrayBuffer(this.inputAnalyser.frequencyBinCount));

    this.outputAnalyser = this.outputCtx.createAnalyser();
    this.outputAnalyser.fftSize = 64;
    this.outputAnalyser.connect(this.outputCtx.destination);
    this.outputFreq = new Uint8Array(new ArrayBuffer(this.outputAnalyser.frequencyBinCount));

    this.nextStartTime = this.outputCtx.currentTime;

    const params = new URLSearchParams({
      mode: options.mode,
      characterId: options.characterId,
    });
    if (options.gameId) params.set('gameId', options.gameId);
    if (options.topic) params.set('topic', options.topic);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/live?${params.toString()}`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          type: string;
          data?: string;
          text?: string;
          message?: string;
        };

        if (msg.type === 'ready') {
          this.isConnected = true;
          this.suppressCurrentTurn = false;
          this.awaitingTurnComplete = false;
          this.hasSentMicAudioSinceTurn = false;
          this.startMicStreaming();
          if (this.options?.initialPrompt && ws.readyState === WebSocket.OPEN) {
            if (this.echoGuard) {
              this.isModelGenerating = true;
              this.modelGeneratingDeadline = performance.now() + MODEL_TURN_SAFETY_MS;
              this.micGatedSince = performance.now();
              this.awaitingTurnComplete = true;
              this.options?.onStateChange('speaking');
            } else {
              this.options?.onStateChange('listening');
            }
            ws.send(JSON.stringify({ type: 'text', text: this.options.initialPrompt }));
          } else {
            this.options?.onStateChange('listening');
          }
        } else if (msg.type === 'audio' && msg.data) {
          if (this.suppressCurrentTurn) return;
          this.clearCooldownTimer();
          this.isModelGenerating = true;
          this.modelGeneratingDeadline = performance.now() + MODEL_TURN_SAFETY_MS;
          if (this.micGatedSince === 0) this.micGatedSince = performance.now();
          this.awaitingTurnComplete = true;
          this.schedulePcmAudio(msg.data);
        } else if (msg.type === 'inputTranscript' && msg.text) {
          if (this.echoGuard) {
            if (!this.hasSentMicAudioSinceTurn) return;
            if (this.isMicGated() && this.micGatedSince > 0 && performance.now() - this.micGatedSince > 900) {
              return;
            }
          }
          this.options?.onInputTranscript(msg.text);
        } else if (msg.type === 'outputTranscript' && msg.text) {
          if (this.suppressCurrentTurn) return;
          this.isModelGenerating = true;
          this.modelGeneratingDeadline = performance.now() + MODEL_TURN_SAFETY_MS;
          if (this.micGatedSince === 0) this.micGatedSince = performance.now();
          this.awaitingTurnComplete = true;
          this.options?.onOutputTranscript(msg.text);
        } else if (msg.type === 'interrupted') {
          this.clearPlaybackQueue();
          this.clearCooldownTimer();
          this.isModelGenerating = false;
          this.awaitingTurnComplete = false;
          this.suppressCurrentTurn = false;
          this.echoCooldownUntil = 0;
          this.micGatedSince = 0;
          if (this.isConnected) {
            this.options?.onStateChange('listening');
          }
        } else if (msg.type === 'turnComplete') {
          const wasSuppressed = this.suppressCurrentTurn;
          this.isModelGenerating = false;
          this.awaitingTurnComplete = false;
          this.suppressCurrentTurn = false;
          if (!wasSuppressed) {
            this.options?.onTurnComplete();
          }
          if (
            this.isConnected &&
            !this.isPlayingAudio &&
            performance.now() >= this.echoCooldownUntil
          ) {
            this.micGatedSince = 0;
            this.options?.onStateChange('listening');
          }
        } else if (msg.type === 'error') {
          this.options?.onError(msg.message || 'خطا در مکالمه زنده.');
          this.stop();
        } else if (msg.type === 'closed') {
          this.stop();
        }
      } catch {
        // Ignore invalid frame
      }
    };

    ws.onerror = () => {
      if (this.options) {
        this.options.onError('اتصال وب‌سوکت صوتی زنده برقرار نشد.');
      }
      this.stop();
    };

    ws.onclose = () => {
      if (this.isConnected) {
        this.stop();
      }
    };
  }

  private startMicStreaming(): void {
    if (!this.inputCtx || !this.stream || !this.inputAnalyser) return;

    const source = this.inputCtx.createMediaStreamSource(this.stream);
    const processor = this.inputCtx.createScriptProcessor(2048, 1, 1);
    const muteGain = this.inputCtx.createGain();
    muteGain.gain.value = 0;

    source.connect(this.inputAnalyser);
    this.inputAnalyser.connect(processor);
    processor.connect(muteGain);
    muteGain.connect(this.inputCtx.destination);

    this.sourceNode = source;
    this.processor = processor;
    this.muteGain = muteGain;

    const inputRate = this.inputCtx.sampleRate;

    processor.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isConnected) return;
      if (this.isMicGated()) return;
      this.hasSentMicAudioSinceTurn = true;
      const raw = e.inputBuffer.getChannelData(0);
      const downsampled = downsampleBuffer(raw, inputRate, 16000);
      const base64 = floatTo16BitPcmBase64(downsampled);
      this.ws.send(JSON.stringify({ type: 'audio', data: base64 }));
    };
  }

  private schedulePcmAudio(base64Pcm: string): void {
    if (!this.outputCtx || !this.outputAnalyser) return;

    const float32 = base64PcmToFloat32(base64Pcm);
    if (float32.length === 0) return;

    const buffer = this.outputCtx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = this.outputCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputAnalyser);

    const now = this.outputCtx.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now;
    }

    const startTime = this.nextStartTime;
    this.nextStartTime = startTime + buffer.duration;

    this.activeSources.add(source);
    if (!this.isPlayingAudio) {
      this.isPlayingAudio = true;
      this.options?.onStateChange('speaking');
    }

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0 && this.isConnected) {
        this.isPlayingAudio = false;
        if (this.echoGuard) {
          this.echoCooldownUntil = performance.now() + ECHO_TAIL_COOLDOWN_MS;
          this.clearCooldownTimer();
          this.cooldownTimer = window.setTimeout(() => {
            this.cooldownTimer = null;
            if (this.isConnected && !this.isPlayingAudio && !this.isModelGenerating) {
              this.micGatedSince = 0;
              this.options?.onStateChange('listening');
            }
          }, ECHO_TAIL_COOLDOWN_MS);
        } else {
          this.options?.onStateChange('listening');
        }
      }
    };

    source.start(startTime);
  }

  private clearPlaybackQueue(): void {
    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        // ignore
      }
    }
    this.activeSources.clear();
    this.isPlayingAudio = false;
    if (this.outputCtx) {
      this.nextStartTime = this.outputCtx.currentTime;
    }
  }

  sendText(text: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && text.trim()) {
      this.suppressCurrentTurn = false;
      if (this.echoGuard) {
        this.clearPlaybackQueue();
        this.clearCooldownTimer();
        this.isModelGenerating = true;
        this.modelGeneratingDeadline = performance.now() + MODEL_TURN_SAFETY_MS;
        this.micGatedSince = performance.now();
        this.awaitingTurnComplete = true;
        this.options?.onStateChange('speaking');
      }
      this.ws.send(JSON.stringify({ type: 'text', text: text.trim() }));
    }
  }

  getFrequencyLevels(barCount: number): number[] {
    if (this.isPlayingAudio && this.outputAnalyser && this.outputFreq) {
      this.outputAnalyser.getByteFrequencyData(this.outputFreq);
      const levels: number[] = [];
      const step = Math.max(1, Math.floor(this.outputFreq.length / barCount));
      for (let i = 0; i < barCount; i += 1) {
        const value = this.outputFreq[Math.min(i * step, this.outputFreq.length - 1)] || 0;
        levels.push(Math.max(0.08, Math.min(1, value / 210)));
      }
      return levels;
    }

    if (this.isMicGated()) {
      return new Array(barCount).fill(0.08);
    }

    const analyser = this.inputAnalyser;
    const freqArray = this.inputFreq;

    if (!analyser || !freqArray) {
      return new Array(barCount).fill(0.1);
    }

    analyser.getByteFrequencyData(freqArray);
    const levels: number[] = [];
    const step = Math.max(1, Math.floor(freqArray.length / barCount));
    for (let i = 0; i < barCount; i += 1) {
      const value = freqArray[Math.min(i * step, freqArray.length - 1)] || 0;
      levels.push(Math.max(0.08, Math.min(1, value / 210)));
    }
    return levels;
  }

  stop(): void {
    this.isConnected = false;
    this.isModelGenerating = false;
    this.awaitingTurnComplete = false;
    this.suppressCurrentTurn = false;
    this.echoCooldownUntil = 0;
    this.micGatedSince = 0;
    this.hasSentMicAudioSinceTurn = false;
    this.clearCooldownTimer();
    this.clearPlaybackQueue();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch {
        // ignore
      }
      this.processor.onaudioprocess = null;
      this.processor = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }

    if (this.muteGain) {
      try {
        this.muteGain.disconnect();
      } catch {
        // ignore
      }
      this.muteGain = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    if (this.inputCtx) {
      this.inputCtx.close().catch(() => undefined);
      this.inputCtx = null;
    }

    if (this.outputCtx) {
      this.outputCtx.close().catch(() => undefined);
      this.outputCtx = null;
    }

    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.inputFreq = null;
    this.outputFreq = null;

    this.options?.onStateChange('idle');
    this.options = null;
  }
}
