import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Menu,
  Mic,
  Plus,
  RefreshCw,
  Send,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { AssistantMessage, AssistantThread, Character } from '../types/app';
import { apiClient } from '../services/apiClient';
import { PersianVoiceRecorder } from '../services/speechRecognition';
import { AiAudioPlayer } from '../services/audioPlayer';
import { formatPersianTime } from '../utils/persian';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatGptScreenProps {
  characters: Character[];
  disabled: boolean;
  onError: (message: string | null) => void;
}

const STORAGE_KEY = 'hamsohbat_assistant_threads_v1';

const STARTER_PROMPTS = [
  'یک ایمیل رسمی و محترمانه برای درخواست جلسه کاری بنویس',
  'تفاوت بین REST API و WebSocket را خیلی ساده و با مثال توضیح بده',
  'یک تابع TypeScript برای اعتبارسنجی شماره موبایل ایرانی بنویس',
  'پنج ایده خلاقانه برای ساخت یک استارتاپ کاربردی در ایران پیشنهاد بده',
];

function loadThreads(): AssistantThread[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const ChatGptScreen: React.FC<ChatGptScreenProps> = ({
  characters,
  disabled,
  onError,
}) => {
  const [threads, setThreads] = useState<AssistantThread[]>(() => loadThreads());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    const existing = loadThreads();
    return existing[0]?.id || null;
  });
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('assistant');
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<PersianVoiceRecorder | null>(null);
  const playerRef = useRef<AiAudioPlayer | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  if (!recorderRef.current) recorderRef.current = new PersianVoiceRecorder();
  if (!playerRef.current) playerRef.current = new AiAudioPlayer();

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads.slice(0, 30)));
    } catch {
      // ignore storage quota
    }
  }, [threads]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      recorderRef.current?.cancel();
      playerRef.current?.stop();
    };
  }, []);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) || null,
    [threads, activeThreadId]
  );

  useEffect(() => {
    if (activeThread) {
      setSelectedPersonaId(activeThread.personaId);
    }
  }, [activeThread]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages.length, isStreaming]);

  const activePersonaLabel = useMemo(() => {
    if (selectedPersonaId === 'assistant') return 'دستیار هوشمند';
    return characters.find((c) => c.id === selectedPersonaId)?.name || 'دستیار هوشمند';
  }, [selectedPersonaId, characters]);

  const handleNewChat = () => {
    if (isStreaming) {
      abortRef.current?.abort();
      setIsStreaming(false);
    }
    playerRef.current?.stop();
    setSpeakingMsgId(null);
    setActiveThreadId(null);
    setMobileSidebarOpen(false);
  };

  const handleDeleteThread = (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (activeThreadId === threadId) {
      setActiveThreadId(null);
    }
  };

  const sendMessage = async (rawText: string, regenerateThread?: AssistantThread) => {
    const cleaned = rawText.trim();
    if (!cleaned || isStreaming || disabled) return;

    onError(null);
    playerRef.current?.stop();
    setSpeakingMsgId(null);

    let targetThreadId = regenerateThread?.id || activeThreadId;
    let baseMessages: AssistantMessage[] = regenerateThread?.messages || activeThread?.messages || [];

    if (!targetThreadId) {
      const createdId = `thr_${Date.now()}`;
      const newThread: AssistantThread = {
        id: createdId,
        title: cleaned.slice(0, 42) + (cleaned.length > 42 ? '…' : ''),
        personaId: selectedPersonaId,
        updatedAt: Date.now(),
        messages: [],
      };
      setThreads((prev) => [newThread, ...prev]);
      setActiveThreadId(createdId);
      targetThreadId = createdId;
      baseMessages = [];
    }

    const userMsg: AssistantMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: cleaned,
      timestamp: Date.now(),
      personaId: selectedPersonaId,
    };

    const assistantMsgId = `m_${Date.now() + 1}`;
    const assistantPlaceholder: AssistantMessage = {
      id: assistantMsgId,
      role: 'model',
      text: '',
      timestamp: Date.now(),
      personaId: selectedPersonaId,
    };

    const historyForApi = baseMessages.map((m) => ({ role: m.role, text: m.text }));

    setThreads((prev) =>
      prev.map((t) =>
        t.id === targetThreadId
          ? {
              ...t,
              personaId: selectedPersonaId,
              updatedAt: Date.now(),
              messages: [...baseMessages, userMsg, assistantPlaceholder],
            }
          : t
      )
    );

    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    try {
      await apiClient.streamAssistantReply({
        message: cleaned,
        personaId: selectedPersonaId,
        history: historyForApi,
        signal: controller.signal,
        onChunk: (chunk) => {
          setThreads((prev) =>
            prev.map((t) => {
              if (t.id !== targetThreadId) return t;
              return {
                ...t,
                updatedAt: Date.now(),
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, text: m.text + chunk } : m
                ),
              };
            })
          );
        },
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = (err as Error).message || 'خطا در دریافت پاسخ.';
        onError(msg);
        setThreads((prev) =>
          prev.map((t) =>
            t.id === targetThreadId
              ? {
                  ...t,
                  messages: t.messages.filter((m) => m.id !== assistantMsgId || m.text.trim().length > 0),
                }
              : t
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleRegenerate = () => {
    if (!activeThread || isStreaming) return;
    const msgs = [...activeThread.messages];
    if (msgs.length === 0) return;
    if (msgs[msgs.length - 1].role === 'model') {
      msgs.pop();
    }
    const lastUser = msgs.pop();
    if (!lastUser) return;
    const trimmedThread: AssistantThread = {
      ...activeThread,
      messages: msgs,
    };
    sendMessage(lastUser.text, trimmedThread);
  };

  const handleCopyMessage = async (msg: AssistantMessage) => {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // ignore
    }
  };

  const handleSpeakMessage = async (msg: AssistantMessage) => {
    if (!msg.text.trim()) return;
    playerRef.current?.unlock();
    if (speakingMsgId === msg.id) {
      playerRef.current?.stop();
      setSpeakingMsgId(null);
      return;
    }

    onError(null);
    const voiceCharacterId =
      msg.personaId && msg.personaId !== 'assistant'
        ? msg.personaId
        : characters[0]?.id || 'amir';

    try {
      setSpeakingMsgId(msg.id);
      const { audioBase64, mimeType } = await apiClient.synthesizeSpeech({
        text: msg.text.slice(0, 1000),
        characterId: voiceCharacterId,
      });
      await playerRef.current?.playBase64(audioBase64, mimeType, () => {
        setSpeakingMsgId(null);
      });
    } catch (err) {
      setSpeakingMsgId(null);
      onError((err as Error).message || 'خطا در پخش صوتی پاسخ.');
    }
  };

  const handleToggleDictation = async () => {
    onError(null);
    if (isDictating) {
      setIsDictating(false);
      try {
        const rec = await recorderRef.current!.stop();
        if (rec.transcript) {
          setInputText((prev) => (prev ? `${prev} ${rec.transcript}` : rec.transcript));
        } else if (rec.audioBase64) {
          const res = await apiClient.transcribeAudio({
            audioBase64: rec.audioBase64,
            mimeType: rec.mimeType,
          });
          if (res.transcript) {
            setInputText((prev) => (prev ? `${prev} ${res.transcript}` : res.transcript));
          }
        }
      } catch (err) {
        onError((err as Error).message || 'خطا در تبدیل صدا به متن.');
      }
      return;
    }

    try {
      await recorderRef.current!.start(() => undefined);
      setIsDictating(true);
    } catch (err) {
      onError((err as Error).message || 'دسترسی به میکروفون برقرار نشد.');
    }
  };

  const messages = activeThread?.messages || [];

  const sidebarContent = (
    <div className="flex h-full flex-col gap-3">
      <button
        type="button"
        onClick={handleNewChat}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff7a2f] px-4 py-2.5 text-sm font-bold text-[#0b0d12] transition-opacity hover:opacity-95"
      >
        <Plus className="h-4 w-4" />
        <span>گفتگوی جدید</span>
      </button>

      <div className="flex-1 space-y-1.5 overflow-y-auto pl-1">
        {threads.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-500">
            هنوز گفتگویی ذخیره نشده است
          </p>
        ) : (
          threads.map((thread) => {
            const isSelected = thread.id === activeThreadId;
            return (
              <div
                key={thread.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveThreadId(thread.id);
                  setMobileSidebarOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setActiveThreadId(thread.id);
                    setMobileSidebarOpen(false);
                  }
                }}
                className={`group flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-right transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#1d2230] text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{thread.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                    {formatPersianTime(thread.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="حذف گفتگو"
                  onClick={(e) => handleDeleteThread(thread.id, e)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 opacity-70 transition-colors hover:bg-rose-500/15 hover:text-rose-300 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="relative flex flex-1 overflow-hidden rounded-3xl border border-white/10 bg-[#12151e] min-h-[640px]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-l border-white/[0.08] bg-[#0f121a] p-4 md:flex md:flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-72 flex-col border-l border-white/10 bg-[#0f121a] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-white">تاریخچه گفتگوها</span>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Chat Pane */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Persona Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="فهرست گفتگوها"
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-white/10 text-slate-300 md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-white sm:text-base">{activePersonaLabel}</h1>
              <p className="text-[11px] text-slate-400">چت متنی جریانی با پشتیبانی از کد و فارسی</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => setSelectedPersonaId('assistant')}
              className={`min-h-[34px] whitespace-nowrap shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                selectedPersonaId === 'assistant'
                  ? 'bg-[#1d2230] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              دستیار هوشمند
            </button>
            {characters.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedPersonaId(c.id)}
                className={`min-h-[34px] whitespace-nowrap shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  selectedPersonaId === c.id
                    ? 'bg-[#1d2230] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-8 text-center">
              <h2 className="text-xl font-extrabold text-white sm:text-2xl">
                چطور می‌تونم کمکت کنم؟
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                هر سوالی داری بپرس، کد بنویس، متن ویرایش کن یا با شخصیت‌های هم‌صحبت چت کن.
              </p>

              <div className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={disabled}
                    onClick={() => sendMessage(prompt)}
                    className="rounded-2xl border border-white/10 bg-[#171b27] p-4 text-right text-xs leading-6 text-slate-200 transition-colors hover:border-[#1fe0c5]/50 hover:bg-[#1b2030] disabled:opacity-40"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const isLastModel = !isUser && idx === messages.length - 1;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1.5 ${isUser ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-[92%] rounded-2xl px-4 py-3 sm:max-w-[82%] ${
                      isUser
                        ? 'rounded-br-sm border border-[#ff7a2f]/30 bg-[#ff7a2f]/10 text-sm leading-7 text-slate-100'
                        : 'w-full rounded-bl-sm border border-white/10 bg-[#171b27]'
                    }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    ) : msg.text ? (
                      <MarkdownRenderer text={msg.text} />
                    ) : (
                      <span className="inline-block text-xs text-slate-400">در حال نوشتن...</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 px-1 text-[11px] text-slate-400 tabular-nums">
                    <span>{isUser ? 'شما' : activePersonaLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatPersianTime(msg.timestamp)}</span>

                    {!isUser && msg.text && (
                      <>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg)}
                          className="inline-flex items-center gap-1 text-slate-300 hover:text-white"
                        >
                          {copiedId === msg.id ? (
                            <Check className="h-3 w-3 text-[#1fe0c5]" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          <span>{copiedId === msg.id ? 'کپی شد' : 'کپی'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSpeakMessage(msg)}
                          className="inline-flex items-center gap-1 text-[#1fe0c5] hover:underline"
                        >
                          <Volume2 className="h-3 w-3" />
                          <span>{speakingMsgId === msg.id ? 'توقف صدا' : 'شنیدن پاسخ'}</span>
                        </button>

                        {isLastModel && !isStreaming && (
                          <button
                            type="button"
                            onClick={handleRegenerate}
                            className="inline-flex items-center gap-1 text-slate-300 hover:text-white"
                          >
                            <RefreshCw className="h-3 w-3" />
                            <span>پاسخ جدید</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(inputText);
          }}
          className="border-t border-white/[0.08] bg-[#0f121a] p-3 sm:p-4"
        >
          <div className="flex items-end gap-2.5 rounded-2xl border border-white/10 bg-[#171b27] p-2">
            <button
              type="button"
              onClick={handleToggleDictation}
              disabled={disabled || isStreaming}
              aria-label={isDictating ? 'توقف تبدیل صدا به متن' : 'تایپ صوتی فارسی'}
              title={isDictating ? 'پایان ضبط' : 'گفتار به متن'}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                isDictating
                  ? 'bg-rose-500 text-white'
                  : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {isDictating ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              disabled={disabled}
              onChange={(e) => {
                setInputText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(inputText);
                }
              }}
              placeholder={`پیامی برای ${activePersonaLabel} بنویسید...`}
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-sm leading-6 text-white placeholder:text-slate-500 focus:outline-none"
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-rose-500 px-4 text-xs font-bold text-white transition-opacity hover:opacity-90"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>توقف</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={disabled || !inputText.trim()}
                aria-label="ارسال پیام"
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#1fe0c5] px-4 text-xs font-bold text-[#0b0d12] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                <span>ارسال</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
