interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}

interface SpeechRecognitionEvent extends Event {
  results: ArrayLike<SpeechRecognitionResult>;
}

interface BrowserSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

export interface RecordedUtterance {
  transcript: string;
  audioBase64: string;
  mimeType: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export class PersianVoiceRecorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private recognition: BrowserSpeechRecognition | null = null;
  private finalTranscript = '';
  private interimTranscript = '';

  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freqArray: Uint8Array<ArrayBuffer> | null = null;

  async start(onInterimTranscript: (text: string) => void): Promise<void> {
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
          'دسترسی به میکروفون رد شد. لطفاً از نوار آدرس یا تنظیمات مرورگر اجازه میکروفون را فعال کنید.'
        );
      }
      throw new Error('میکروفون پیدا نشد یا امکان ضبط صدا وجود ندارد.');
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioCtx();
    const source = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 64;
    source.connect(this.analyser);
    this.freqArray = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

    const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    this.chunks = [];
    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start(200);

    this.finalTranscript = '';
    this.interimTranscript = '';
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      this.recognition = new SpeechRec();
      this.recognition.lang = 'fa-IR';
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.onresult = (event) => {
        let finalText = '';
        let interim = '';
        for (let i = 0; i < event.results.length; i += 1) {
          const item = event.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) {
            finalText += `${text} `;
          } else {
            interim += text;
          }
        }
        this.finalTranscript = finalText.trim();
        this.interimTranscript = interim.trim();
        onInterimTranscript([this.finalTranscript, this.interimTranscript].filter(Boolean).join(' '));
      };
      this.recognition.onerror = () => {
        // Server-side Gemini STT handles transcription when browser speech recognition fails
      };
      try {
        this.recognition.start();
      } catch {
        // Ignore if already started
      }
    }
  }

  getFrequencyLevels(barCount: number): number[] {
    if (!this.analyser || !this.freqArray) {
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

  async stop(): Promise<RecordedUtterance> {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.recognition = null;
    }

    const recorder = this.mediaRecorder;
    const blob = await new Promise<Blob>((resolve) => {
      if (!recorder || recorder.state === 'inactive') {
        resolve(new Blob(this.chunks, { type: 'audio/webm' }));
        return;
      }
      recorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.stop();
    });

    this.cleanupStream();

    const audioBase64 = blob.size > 0 ? await blobToBase64(blob) : '';
    const transcript = [this.finalTranscript, this.interimTranscript].filter(Boolean).join(' ').trim();

    return {
      transcript,
      audioBase64,
      mimeType: blob.type || 'audio/webm',
    };
  }

  cancel(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.recognition = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.cleanupStream();
  }

  private cleanupStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }
    this.analyser = null;
    this.freqArray = null;
    this.mediaRecorder = null;
  }
}
