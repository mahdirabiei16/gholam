export class AiAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private freqArray: Uint8Array<ArrayBuffer> | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private startedAt = 0;
  private pauseOffset = 0;
  private paused = false;
  private isPlaying = false;
  private onEndedCallback: (() => void) | null = null;

  private ensureContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (!this.analyser) {
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.connect(this.audioCtx.destination);
      this.freqArray = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    }
    return this.audioCtx;
  }

  /**
   * Call synchronously inside any user click/tap handler before async API calls
   * so AudioContext stays unlocked for delayed AI audio playback.
   */
  unlock(): void {
    try {
      const ctx = this.ensureContext();
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      // Play a 1-sample silent buffer to satisfy strict Safari/iOS/iframe autoplay policies
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
      const node = ctx.createBufferSource();
      node.buffer = silent;
      node.connect(ctx.destination);
      node.start(0);
    } catch {
      // ignore if AudioContext unavailable
    }
  }

  async playBase64(base64: string, _mimeType: string, onEnded?: () => void): Promise<void> {
    this.stop();
    this.onEndedCallback = onEnded || null;

    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
    this.currentBuffer = decoded;
    this.pauseOffset = 0;
    this.paused = false;

    this.startBufferAt(0);
  }

  private startBufferAt(offsetSeconds: number): void {
    if (!this.audioCtx || !this.analyser || !this.currentBuffer) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = this.currentBuffer;
    source.connect(this.analyser);

    this.sourceNode = source;
    this.startedAt = this.audioCtx.currentTime - offsetSeconds;
    this.isPlaying = true;
    this.paused = false;

    source.onended = () => {
      if (this.sourceNode !== source) return;
      this.sourceNode = null;
      this.isPlaying = false;
      if (!this.paused) {
        this.currentBuffer = null;
        this.pauseOffset = 0;
        this.onEndedCallback?.();
      }
    };

    source.start(0, Math.max(0, offsetSeconds));
  }

  togglePause(): boolean {
    if (!this.audioCtx || !this.currentBuffer) return false;

    if (this.paused) {
      this.startBufferAt(this.pauseOffset);
      return false;
    }

    if (this.sourceNode) {
      this.pauseOffset = Math.max(0, this.audioCtx.currentTime - this.startedAt);
      this.paused = true;
      this.isPlaying = false;
      const src = this.sourceNode;
      this.sourceNode = null;
      try {
        src.stop();
        src.disconnect();
      } catch {
        // ignore
      }
      return true;
    }

    return false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  stop(): void {
    this.paused = false;
    this.isPlaying = false;
    this.pauseOffset = 0;
    this.currentBuffer = null;

    if (this.sourceNode) {
      const src = this.sourceNode;
      this.sourceNode = null;
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // ignore
      }
    }
  }

  getFrequencyLevels(barCount: number): number[] {
    if (!this.analyser || !this.freqArray || !this.isPlaying || this.paused) {
      return new Array(barCount).fill(0.08);
    }
    this.analyser.getByteFrequencyData(this.freqArray);
    const levels: number[] = [];
    const step = Math.max(1, Math.floor(this.freqArray.length / barCount));
    for (let i = 0; i < barCount; i += 1) {
      const value = this.freqArray[Math.min(i * step, this.freqArray.length - 1)] || 0;
      levels.push(Math.max(0.08, Math.min(1, value / 220)));
    }
    return levels;
  }
}
