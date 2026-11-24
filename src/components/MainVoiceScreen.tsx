import React, { useEffect, useRef, useState } from 'react';
import {
  Headphones,
  Loader2,
  Mic,
  Pause,
  PhoneCall,
  PhoneOff,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  Volume2,
} from 'lucide-react';
import { Character, ChatMessage, VoiceInteractionMode, VoiceState } from '../types/app';
import { formatPersianTime } from '../utils/persian';
import { CharacterAvatar } from './CharacterAvatar';
import { WaveformVisualizer } from './WaveformVisualizer';

interface MainVoiceScreenProps {
  characters: Character[];
  activeCharacter: Character;
  messages: ChatMessage[];
  voiceState: VoiceState;
  interactionMode: VoiceInteractionMode;
  echoGuard: boolean;
  interimTranscript: string;
  liveOutputDraft: string;
  isPaused: boolean;
  disabled: boolean;
  getWaveformLevels: (barCount: number) => number[];
  onChangeInteractionMode: (mode: VoiceInteractionMode) => void;
  onToggleEchoGuard: () => void;
  onInterruptRealtime: () => void;
  onSelectCharacter: (character: Character) => void;
  onMicAction: () => void;
  onSendText: (text: string) => void;
  onTogglePause: () => void;
  onStopAudio: () => void;
  onReplayMessage: (msg: ChatMessage) => void;
  onResetConversation: () => void;
}

const STATUS_META: Record<VoiceState, { label: string; toneClass: string }> = {
  idle: { label: 'آماده گفتگو', toneClass: 'text-slate-300' },
  connecting: { label: 'در حال برقراری تماس صوتی زنده...', toneClass: 'text-slate-200' },
  listening: { label: 'در حال گوش دادن به صدای شما...', toneClass: 'text-[#ff9c66]' },
  thinking: { label: 'در حال فکر کردن و ساخت پاسخ...', toneClass: 'text-slate-200' },
  speaking: { label: 'در حال صحبت کردن...', toneClass: 'text-[#1fe0c5]' },
  error: { label: 'خطا در برقراری ارتباط', toneClass: 'text-rose-300' },
};

export const MainVoiceScreen: React.FC<MainVoiceScreenProps> = ({
  characters,
  activeCharacter,
  messages,
  voiceState,
  interactionMode,
  echoGuard,
  interimTranscript,
  liveOutputDraft,
  isPaused,
  disabled,
  getWaveformLevels,
  onChangeInteractionMode,
  onToggleEchoGuard,
  onInterruptRealtime,
  onSelectCharacter,
  onMicAction,
  onSendText,
  onTogglePause,
  onStopAudio,
  onReplayMessage,
  onResetConversation,
}) => {
  const [textInput, setTextInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, liveOutputDraft]);

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = textInput.trim();
    if (!cleaned || disabled) return;
    setTextInput('');
    onSendText(cleaned);
  };

  const statusMeta = STATUS_META[voiceState];
  const isLiveConnected =
    interactionMode === 'realtime' &&
    (voiceState === 'connecting' || voiceState === 'listening' || voiceState === 'speaking');

  return (
    <div className="flex flex-1 flex-col gap-5">
      <section className="relative flex flex-col items-center rounded-3xl border border-white/10 bg-[#12151e] px-5 py-6 text-center sm:px-8 sm:py-8">
        <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-3">
          <div
            className="flex flex-wrap items-center gap-1.5 rounded-xl bg-white/[0.03] p-1"
            role="tablist"
            aria-label="تغییر سریع شخصیت"
          >
            {characters.map((char) => {
              const isActive = char.id === activeCharacter.id;
              return (
                <button
                  key={char.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSelectCharacter(char)}
                  className={`min-h-[38px] whitespace-nowrap shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-[#1d2230] text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {char.name}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1"
              aria-label="حالت مکالمه صوتی"
            >
              <button
                type="button"
                onClick={() => onChangeInteractionMode('realtime')}
                className={`min-h-[34px] whitespace-nowrap shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  interactionMode === 'realtime'
                    ? 'bg-[#ff7a2f] text-[#0b0d12]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                زنده (Real-Time)
              </button>
              <button
                type="button"
                onClick={() => onChangeInteractionMode('turn')}
                className={`min-h-[34px] whitespace-nowrap shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  interactionMode === 'turn'
                    ? 'bg-[#1d2230] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                نوبتی (دکمه‌ای)
              </button>
            </div>

            {interactionMode === 'realtime' && (
              <button
                type="button"
                onClick={onToggleEchoGuard}
                title={
                  echoGuard
                    ? 'در حالت اسپیکر، هنگام صحبت هوش مصنوعی میکروفون بسته می‌شود تا صدای خودش را نشنود.'
                    : 'در حالت هدفون می‌توانید هم‌زمان وسط صحبت هوش مصنوعی حرف بزنید.'
                }
                className={`inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  echoGuard
                    ? 'border-[#1fe0c5]/40 bg-[#1fe0c5]/10 text-[#1fe0c5]'
                    : 'border-white/10 bg-[#181c28] text-slate-300 hover:border-white/20 hover:text-white'
                }`}
              >
                {echoGuard ? (
                  <ShieldCheck className="h-3.5 w-3.5" />
                ) : (
                  <Headphones className="h-3.5 w-3.5" />
                )}
                <span>{echoGuard ? 'ضد اکو (اسپیکر)' : 'حالت هدفون'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onResetConversation}
              className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>مکالمه جدید</span>
            </button>
          </div>
        </div>

        <CharacterAvatar
          name={activeCharacter.name}
          avatarUrl={activeCharacter.avatarUrl}
          accentColor={activeCharacter.accentColor}
          voiceState={voiceState}
        />

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          {activeCharacter.name}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {activeCharacter.shortRole} · {activeCharacter.voiceDescription}
        </p>

        <div className="mt-4 flex w-full justify-center">
          <WaveformVisualizer voiceState={voiceState} getLevels={getWaveformLevels} />
        </div>

        <div className={`mt-2 flex items-center gap-2 text-sm font-semibold ${statusMeta.toneClass}`}>
          {(voiceState === 'thinking' || voiceState === 'connecting') && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {voiceState === 'listening' && <Mic className="h-4 w-4" />}
          {voiceState === 'speaking' && <Volume2 className="h-4 w-4" />}
          <span>{statusMeta.label}</span>
        </div>

        {voiceState === 'listening' && interimTranscript && (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-amber-200/90">
            «{interimTranscript}»
          </p>
        )}

        <p className="mt-2 max-w-lg text-xs leading-relaxed text-slate-400">
          {interactionMode === 'realtime'
            ? isLiveConnected
              ? echoGuard
                ? 'تماس زنده برقرار است (محافظ اکو فعال)؛ هنگام صحبت شخصیت میکروفون بسته می‌شود تا صدای خودش را ننویسد.'
                : 'حالت هدفون فعال است؛ بدون نیاز به زدن دکمه صحبت کن و هر وقت خواستی وسط حرفش بپر.'
              : 'دکمه زیر را بزن تا تماس صوتی زنده و بی‌درنگ با شخصیت برقرار شود.'
            : voiceState === 'listening'
            ? 'هر وقت صحبتت تمام شد، دوباره دکمه میکروفون را بزن تا پاسخ بشنوی.'
            : voiceState === 'speaking'
            ? 'برای قطع کردن صحبت و حرف زدن، دوباره دکمه میکروفون را بزن.'
            : 'دکمه میکروفون را بزن و کاملاً طبیعی به فارسی صحبت کن.'}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {interactionMode === 'realtime' ? (
            <>
              <button
                type="button"
                onClick={onMicAction}
                disabled={disabled || voiceState === 'connecting'}
                aria-label={isLiveConnected ? 'پایان مکالمه زنده' : 'شروع مکالمه صوتی زنده'}
                className={`inline-flex min-h-[56px] whitespace-nowrap shrink-0 items-center gap-2.5 rounded-full px-7 py-3 text-sm font-bold transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff7a2f] disabled:cursor-not-allowed disabled:opacity-45 ${
                  isLiveConnected
                    ? 'bg-rose-500 text-white shadow-[0_0_28px_rgba(244,63,94,0.45)] hover:scale-[1.02]'
                    : 'bg-[#ff7a2f] text-[#0b0d12] shadow-[0_0_28px_rgba(255,122,47,0.38)] hover:scale-[1.03]'
                }`}
              >
                {isLiveConnected ? (
                  <>
                    <PhoneOff className="h-5 w-5" />
                    <span>پایان مکالمه زنده</span>
                  </>
                ) : (
                  <>
                    <PhoneCall className="h-5 w-5" />
                    <span>شروع مکالمه زنده</span>
                  </>
                )}
              </button>

              {isLiveConnected && voiceState === 'speaking' && echoGuard && (
                <button
                  type="button"
                  onClick={onInterruptRealtime}
                  className="inline-flex min-h-[48px] whitespace-nowrap shrink-0 items-center gap-2 rounded-xl border border-[#1fe0c5]/45 bg-[#181c28] px-4 py-2.5 text-xs font-bold text-[#1fe0c5] transition-colors hover:bg-[#1fe0c5]/15"
                >
                  <Mic className="h-4 w-4" />
                  <span>قطع صحبت و حرف زدن</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onMicAction}
                disabled={disabled || voiceState === 'thinking'}
                aria-label={voiceState === 'listening' ? 'توقف ضبط و ارسال صدا' : 'شروع صحبت با میکروفون'}
                className={`flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff7a2f] disabled:cursor-not-allowed disabled:opacity-45 ${
                  voiceState === 'listening'
                    ? 'scale-105 bg-rose-500 text-white shadow-[0_0_28px_rgba(244,63,94,0.45)]'
                    : 'bg-[#ff7a2f] text-[#0b0d12] shadow-[0_0_28px_rgba(255,122,47,0.38)] hover:scale-105'
                }`}
              >
                {voiceState === 'listening' ? (
                  <Square className="h-6 w-6 fill-current" />
                ) : (
                  <Mic className="h-7 w-7" />
                )}
              </button>

              {voiceState === 'speaking' && (
                <>
                  <button
                    type="button"
                    onClick={onTogglePause}
                    className="inline-flex min-h-[44px] whitespace-nowrap shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-[#181c28] px-4 py-2 text-xs font-semibold text-slate-100 transition-colors hover:border-[#1fe0c5]/60"
                  >
                    {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    <span>{isPaused ? 'ادامه پخش' : 'مکث'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onStopAudio}
                    className="inline-flex min-h-[44px] whitespace-nowrap shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-[#181c28] px-4 py-2 text-xs font-semibold text-slate-100 transition-colors hover:border-rose-400/60"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    <span>توقف صدا</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#12151e] p-5">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 text-xs font-semibold text-slate-400">
          <span>گفتگو با {activeCharacter.name}</span>
          <span>{activeCharacter.shortRole}</span>
        </div>

        <div ref={scrollRef} className="flex max-h-72 flex-col gap-3 overflow-y-auto pl-1">
          {messages.length === 0 && !liveOutputDraft ? (
            <div className="py-8 text-center text-sm text-slate-400">
              {activeCharacter.greetingPrompt}
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex max-w-[85%] flex-col gap-1.5 sm:max-w-[75%] ${
                      isUser ? 'self-start' : 'self-end'
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-7 ${
                        isUser
                          ? 'rounded-br-sm border border-[#ff7a2f]/30 bg-[#ff7a2f]/10 text-slate-100'
                          : 'rounded-bl-sm border border-[#1fe0c5]/25 bg-[#1fe0c5]/[0.08] text-slate-100'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 tabular-nums">
                      <span>{isUser ? 'شما' : activeCharacter.name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatPersianTime(msg.timestamp)}</span>
                      {!isUser && msg.audioBase64 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={() => onReplayMessage(msg)}
                            className="inline-flex items-center gap-1 font-medium text-[#1fe0c5] hover:underline"
                          >
                            <Volume2 className="h-3 w-3" />
                            <span>پخش صدا</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {liveOutputDraft && (
                <div className="flex max-w-[85%] flex-col gap-1.5 self-end sm:max-w-[75%]">
                  <div className="rounded-2xl rounded-bl-sm border border-[#1fe0c5]/25 bg-[#1fe0c5]/[0.08] px-4 py-3 text-sm leading-7 text-slate-100">
                    {liveOutputDraft}
                  </div>
                  <div className="text-[11px] text-[#1fe0c5]">
                    {activeCharacter.name} · در حال صحبت...
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <form onSubmit={handleSubmitText} className="flex items-center gap-2.5 border-t border-white/[0.06] pt-3">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={disabled || voiceState === 'thinking' || voiceState === 'connecting'}
            placeholder={
              isLiveConnected
                ? `پیام متنی وسط تماس زنده برای ${activeCharacter.name}...`
                : `پیام متنی برای ${activeCharacter.name} بنویس...`
            }
            className="min-h-[44px] flex-1 rounded-xl border border-white/10 bg-[#181c28] px-4 text-sm text-white placeholder:text-slate-500 focus:border-[#1fe0c5] focus:outline-none"
          />
          <button
            type="submit"
            disabled={disabled || !textInput.trim() || voiceState === 'thinking' || voiceState === 'connecting'}
            className="inline-flex min-h-[44px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-xl bg-[#1fe0c5] px-4 py-2 text-sm font-bold text-[#0b0d12] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            <span>ارسال</span>
          </button>
        </form>
      </section>
    </div>
  );
};
