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
import {
  Character,
  ChatMessage,
  GameDefinition,
  GameModeId,
  VoiceInteractionMode,
  VoiceState,
} from '../types/app';
import { formatPersianTime } from '../utils/persian';
import { CharacterAvatar } from './CharacterAvatar';
import { WaveformVisualizer } from './WaveformVisualizer';

interface GamesScreenProps {
  games: GameDefinition[];
  characters: Character[];
  selectedGameId: GameModeId;
  selectedCharacter: Character;
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
  onSelectGame: (gameId: GameModeId) => void;
  onSelectCharacter: (characterId: string) => void;
  onStartGame: (topic?: string) => void;
  onMicAction: (topic?: string) => void;
  onSendText: (text: string) => void;
  onTogglePause: () => void;
  onStopAudio: () => void;
  onReplayMessage: (msg: ChatMessage) => void;
}

export const GamesScreen: React.FC<GamesScreenProps> = ({
  games,
  characters,
  selectedGameId,
  selectedCharacter,
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
  onSelectGame,
  onSelectCharacter,
  onStartGame,
  onMicAction,
  onSendText,
  onTogglePause,
  onStopAudio,
  onReplayMessage,
}) => {
  const [topic, setTopic] = useState('');
  const [textReply, setTextReply] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, liveOutputDraft]);

  const activeGame = games.find((g) => g.id === selectedGameId);
  const isLiveConnected =
    interactionMode === 'realtime' &&
    (voiceState === 'connecting' || voiceState === 'listening' || voiceState === 'speaking');

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = textReply.trim();
    if (!cleaned || disabled) return;
    setTextReply('');
    onSendText(cleaned);
  };

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-extrabold text-white">بازی‌های صوتی تعاملی</h1>
        <p className="text-sm text-slate-400">
          با صدات بازی کن؛ هوش مصنوعی جواب‌های واقعی تو را می‌شنود، تحلیل می‌کند و بازی یا کلکل را ادامه می‌دهد.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {games.map((game) => {
          const isSelected = game.id === selectedGameId;
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => onSelectGame(game.id)}
              className={`flex flex-col items-start rounded-2xl border p-5 text-right transition-colors ${
                isSelected
                  ? 'border-[#ff7a2f]/70 bg-[#171b27]'
                  : 'border-white/10 bg-[#12151e] hover:border-white/20'
              }`}
            >
              <span className="text-lg font-bold text-white">{game.title}</span>
              <span className="mt-1.5 text-sm leading-relaxed text-slate-400">{game.subtitle}</span>
            </button>
          );
        })}
      </div>

      <section className="flex flex-col items-center rounded-3xl border border-white/10 bg-[#12151e] px-5 py-6 text-center sm:px-8">
        <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-white/[0.03] p-1">
            {characters.map((c) => {
              const active = c.id === selectedCharacter.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectCharacter(c.id)}
                  className={`min-h-[38px] whitespace-nowrap shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active ? 'bg-[#1d2230] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1">
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

            {interactionMode === 'turn' && (
              <button
                type="button"
                disabled={disabled || voiceState === 'thinking'}
                onClick={() => onStartGame(topic.trim() || undefined)}
                className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-xl bg-[#1fe0c5] px-4 py-2 text-xs font-bold text-[#0b0d12] transition-opacity hover:opacity-90 disabled:opacity-45"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>
                  {messages.length > 0 ? 'شروع دوباره بازی' : `شروع ${activeGame?.title || 'بازی'}`}
                </span>
              </button>
            )}
          </div>
        </div>

        {selectedGameId === 'jaro-bahs' && (
          <div className="mb-5 w-full max-w-md">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="موضوع کلکل دلخواه (اختیاری، مثلاً: قرمه‌سبزی با سیب‌زمینی آره یا نه؟)"
              className="min-h-[42px] w-full rounded-xl border border-white/10 bg-[#181c28] px-4 text-sm text-white placeholder:text-slate-500 focus:border-[#ff7a2f] focus:outline-none"
            />
          </div>
        )}

        <CharacterAvatar
          name={selectedCharacter.name}
          avatarUrl={selectedCharacter.avatarUrl}
          accentColor={selectedCharacter.accentColor}
          voiceState={voiceState}
        />

        <h2 className="mt-4 text-xl font-extrabold text-white">
          {activeGame?.title} با {selectedCharacter.name}
        </h2>
        <p className="mt-1 text-xs text-slate-400">{selectedCharacter.voiceDescription}</p>

        <div className="mt-3 flex w-full justify-center">
          <WaveformVisualizer voiceState={voiceState} getLevels={getWaveformLevels} />
        </div>

        {(voiceState === 'thinking' || voiceState === 'connecting') && (
          <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              {voiceState === 'connecting' ? 'در حال برقراری بازی زنده...' : 'در حال آماده‌سازی پاسخ...'}
            </span>
          </div>
        )}

        {voiceState === 'listening' && interimTranscript && (
          <p className="mt-2 max-w-xl text-sm text-amber-200/90">«{interimTranscript}»</p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {interactionMode === 'realtime' ? (
            <>
              <button
                type="button"
                onClick={() => onMicAction(topic.trim() || undefined)}
                disabled={disabled || voiceState === 'connecting'}
                className={`inline-flex min-h-[54px] whitespace-nowrap shrink-0 items-center gap-2.5 rounded-full px-7 py-3 text-sm font-bold transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${
                  isLiveConnected
                    ? 'bg-rose-500 text-white shadow-[0_0_28px_rgba(244,63,94,0.45)]'
                    : 'bg-[#ff7a2f] text-[#0b0d12] shadow-[0_0_28px_rgba(255,122,47,0.38)] hover:scale-[1.03]'
                }`}
              >
                {isLiveConnected ? (
                  <>
                    <PhoneOff className="h-5 w-5" />
                    <span>پایان بازی زنده</span>
                  </>
                ) : (
                  <>
                    <PhoneCall className="h-5 w-5" />
                    <span>شروع {activeGame?.title} زنده</span>
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
                onClick={() => onMicAction(topic.trim() || undefined)}
                disabled={disabled || voiceState === 'thinking'}
                aria-label={voiceState === 'listening' ? 'ارسال صدای شما در بازی' : 'صحبت با میکروفون در بازی'}
                className={`flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${
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
                    className="inline-flex min-h-[44px] whitespace-nowrap shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-[#181c28] px-4 py-2 text-xs font-semibold text-slate-100"
                  >
                    {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    <span>{isPaused ? 'ادامه پخش' : 'مکث'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onStopAudio}
                    className="inline-flex min-h-[44px] whitespace-nowrap shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-[#181c28] px-4 py-2 text-xs font-semibold text-slate-100"
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
          <span>روند {activeGame?.title}</span>
          <span>{selectedCharacter.name}</span>
        </div>

        <div ref={scrollRef} className="flex max-h-72 flex-col gap-3 overflow-y-auto pl-1">
          {messages.length === 0 && !liveOutputDraft ? (
            <div className="py-8 text-center text-sm text-slate-400">
              {interactionMode === 'realtime'
                ? `دکمه «شروع ${activeGame?.title} زنده» را بزن و مستقیم بازی را شروع کن!`
                : `دکمه «شروع ${activeGame?.title}» را بزن یا مستقیم با میکروفون صحبت کن!`}
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
                      <span>{isUser ? 'شما' : selectedCharacter.name}</span>
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
                    {selectedCharacter.name} · در حال صحبت...
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <form onSubmit={handleTextSubmit} className="flex items-center gap-2.5 border-t border-white/[0.06] pt-3">
          <input
            type="text"
            value={textReply}
            onChange={(e) => setTextReply(e.target.value)}
            disabled={disabled || voiceState === 'thinking' || voiceState === 'connecting'}
            placeholder="پاسخ متنی (در صورت در دسترس نبودن میکروفون)..."
            className="min-h-[44px] flex-1 rounded-xl border border-white/10 bg-[#181c28] px-4 text-sm text-white placeholder:text-slate-500 focus:border-[#1fe0c5] focus:outline-none"
          />
          <button
            type="submit"
            disabled={disabled || !textReply.trim() || voiceState === 'thinking' || voiceState === 'connecting'}
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
