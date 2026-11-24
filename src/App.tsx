import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import {
  Character,
  ChatMessage,
  GameDefinition,
  GameModeId,
  HealthStatus,
  ScreenTab,
  VoiceInteractionMode,
  VoiceState,
} from './types/app';
import { apiClient } from './services/apiClient';
import { PersianVoiceRecorder } from './services/speechRecognition';
import { AiAudioPlayer } from './services/audioPlayer';
import { LiveVoiceClient } from './services/liveVoiceClient';
import { getOrCreateSessionId } from './utils/persian';
import { ConfigBanner } from './components/ConfigBanner';
import { MainVoiceScreen } from './components/MainVoiceScreen';
import { ChatGptScreen } from './components/ChatGptScreen';
import { CharacterSelectionScreen } from './components/CharacterSelectionScreen';
import { GamesScreen } from './components/GamesScreen';

export default function App() {
  const sessionId = useMemo(() => getOrCreateSessionId(), []);
  const recorderRef = useRef<PersianVoiceRecorder | null>(null);
  const playerRef = useRef<AiAudioPlayer | null>(null);
  const liveClientRef = useRef<LiveVoiceClient | null>(null);

  if (!recorderRef.current) recorderRef.current = new PersianVoiceRecorder();
  if (!playerRef.current) playerRef.current = new AiAudioPlayer();
  if (!liveClientRef.current) liveClientRef.current = new LiveVoiceClient();

  const [tab, setTab] = useState<ScreenTab>('chat');
  const [interactionMode, setInteractionMode] = useState<VoiceInteractionMode>('realtime');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [games, setGames] = useState<GameDefinition[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState<string>('amir');

  const [charMessages, setCharMessages] = useState<Record<string, ChatMessage[]>>({});
  const [gameMessages, setGameMessages] = useState<Record<string, ChatMessage[]>>({});

  const [selectedGameId, setSelectedGameId] = useState<GameModeId>('taha');
  const [gameCharacterId, setGameCharacterId] = useState<string>('amir');
  const [gameTopic, setGameTopic] = useState<string | undefined>(undefined);

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [liveOutputDraft, setLiveOutputDraft] = useState('');
  const liveOutputRef = useRef('');
  const liveInputRef = useRef('');
  const [isPaused, setIsPaused] = useState(false);
  const [echoGuard, setEchoGuard] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiClient.getHealth(), apiClient.getCharacters(), apiClient.getGames()])
      .then(([healthData, chars, gameList]) => {
        setHealth(healthData);
        setCharacters(chars);
        setGames(gameList);
        if (chars.length > 0) {
          setActiveCharacterId(chars[0].id);
        }
      })
      .catch((err: Error) => {
        setError(err.message || 'خطا در اتصال به سرور.');
      });

    return () => {
      recorderRef.current?.cancel();
      playerRef.current?.stop();
      liveClientRef.current?.stop();
    };
  }, []);

  const activeCharacter = useMemo(
    () => characters.find((c) => c.id === activeCharacterId) || characters[0],
    [characters, activeCharacterId]
  );

  const gameCharacter = useMemo(
    () => characters.find((c) => c.id === gameCharacterId) || characters[0],
    [characters, gameCharacterId]
  );

  const playAiResponse = useCallback(async (audioBase64: string, mimeType: string) => {
    setVoiceState('speaking');
    setIsPaused(false);
    try {
      await playerRef.current?.playBase64(audioBase64, mimeType, () => {
        setVoiceState('idle');
        setIsPaused(false);
      });
    } catch {
      setVoiceState('idle');
      setError('پخش خودکار صدا توسط مرورگر مسدود شد؛ می‌توانید دکمه پخش صدا را بزنید.');
    }
  }, []);

  const getWaveformLevels = useCallback(
    (barCount: number): number[] => {
      if (interactionMode === 'realtime' && (voiceState === 'listening' || voiceState === 'speaking')) {
        return liveClientRef.current?.getFrequencyLevels(barCount) || new Array(barCount).fill(0.1);
      }
      if (voiceState === 'listening') {
        return recorderRef.current?.getFrequencyLevels(barCount) || new Array(barCount).fill(0.1);
      }
      if (voiceState === 'speaking') {
        return playerRef.current?.getFrequencyLevels(barCount) || new Array(barCount).fill(0.1);
      }
      return new Array(barCount).fill(0.1);
    },
    [interactionMode, voiceState]
  );

  const appendCharMessage = useCallback((characterId: string, msg: ChatMessage) => {
    setCharMessages((prev) => ({
      ...prev,
      [characterId]: [...(prev[characterId] || []), msg],
    }));
  }, []);

  const appendGameMessage = useCallback((gameKey: string, msg: ChatMessage) => {
    setGameMessages((prev) => ({
      ...prev,
      [gameKey]: [...(prev[gameKey] || []), msg],
    }));
  }, []);

  const stopAllActiveVoice = useCallback(() => {
    recorderRef.current?.cancel();
    playerRef.current?.stop();
    liveClientRef.current?.stop();
    liveInputRef.current = '';
    liveOutputRef.current = '';
    setLiveOutputDraft('');
    setInterimTranscript('');
    setIsPaused(false);
    setVoiceState('idle');
  }, []);

  const handleStartOrStopRealtime = async (
    mode: 'chat' | 'game',
    topicArg?: string
  ) => {
    setError(null);
    const isCurrentlyLive =
      voiceState === 'connecting' || voiceState === 'listening' || voiceState === 'speaking';

    if (isCurrentlyLive) {
      stopAllActiveVoice();
      return;
    }

    const targetChar = mode === 'chat' ? activeCharacter : gameCharacter;
    if (!targetChar) return;

    liveInputRef.current = '';
    liveOutputRef.current = '';
    setInterimTranscript('');
    setLiveOutputDraft('');

    const gameKey = `${selectedGameId}:${targetChar.id}`;
    const initialPrompt =
      mode === 'chat'
        ? 'سلام! مکالمه زنده شروع شد، یک سلام کوتاه و خودمونی به سبک خودت بگو.'
        : topicArg
        ? `بازی رو با این موضوع شروع کن: ${topicArg}`
        : selectedGameId === 'jaro-bahs'
        ? 'بازی جر و بحث رو الان شروع کن و اولین موضع کلکلی رو بگو!'
        : 'بازی طاها رو الان شروع کن و اولین چالش یا سوال رو بپرس!';

    try {
      await liveClientRef.current!.start({
        mode,
        characterId: targetChar.id,
        gameId: mode === 'game' ? selectedGameId : undefined,
        topic: mode === 'game' ? topicArg : undefined,
        initialPrompt,
        echoGuard,
        onStateChange: (next) => {
          setVoiceState(next);
        },
        onInputTranscript: (chunk) => {
          const prev = liveInputRef.current;
          if (!prev) {
            liveInputRef.current = chunk.trimStart();
          } else if (/^\s/.test(chunk) || /\s$/.test(prev)) {
            liveInputRef.current = prev + chunk;
          } else {
            liveInputRef.current = `${prev} ${chunk}`;
          }
          setInterimTranscript(liveInputRef.current);
        },
        onOutputTranscript: (chunk) => {
          if (liveInputRef.current) {
            const finalizedInput = liveInputRef.current;
            liveInputRef.current = '';
            setInterimTranscript('');
            const userMsg: ChatMessage = {
              id: `lu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              sender: 'user',
              text: finalizedInput,
              timestamp: Date.now(),
            };
            if (mode === 'chat') appendCharMessage(targetChar.id, userMsg);
            else appendGameMessage(gameKey, userMsg);
          }

          liveOutputRef.current = `${liveOutputRef.current}${chunk}`;
          setLiveOutputDraft(liveOutputRef.current);
        },
        onTurnComplete: () => {
          if (liveInputRef.current) {
            const finalizedInput = liveInputRef.current;
            liveInputRef.current = '';
            setInterimTranscript('');
            const userMsg: ChatMessage = {
              id: `lu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              sender: 'user',
              text: finalizedInput,
              timestamp: Date.now(),
            };
            if (mode === 'chat') appendCharMessage(targetChar.id, userMsg);
            else appendGameMessage(gameKey, userMsg);
          }

          if (liveOutputRef.current.trim()) {
            const finalizedOutput = liveOutputRef.current.trim();
            liveOutputRef.current = '';
            setLiveOutputDraft('');
            const aiMsg: ChatMessage = {
              id: `la_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              sender: 'ai',
              text: finalizedOutput,
              timestamp: Date.now(),
            };
            if (mode === 'chat') appendCharMessage(targetChar.id, aiMsg);
            else appendGameMessage(gameKey, aiMsg);
          }
        },
        onError: (msg) => {
          setError(msg);
          setVoiceState('error');
        },
      });
    } catch (err) {
      setVoiceState('error');
      setError((err as Error).message || 'امکان برقراری تماس صوتی زنده وجود ندارد.');
    }
  };

  const handleChatTextOrAudio = async (payload: {
    userText?: string;
    audioBase64?: string;
    audioMimeType?: string;
  }) => {
    if (!activeCharacter) return;
    playerRef.current?.unlock();

    if (
      interactionMode === 'realtime' &&
      payload.userText &&
      (voiceState === 'listening' || voiceState === 'speaking')
    ) {
      appendCharMessage(activeCharacter.id, {
        id: `u_${Date.now()}`,
        sender: 'user',
        text: payload.userText,
        timestamp: Date.now(),
      });
      liveClientRef.current?.sendText(payload.userText);
      return;
    }

    setError(null);
    setVoiceState('thinking');

    try {
      const result = await apiClient.sendVoiceTurn({
        sessionId,
        characterId: activeCharacter.id,
        ...payload,
      });

      appendCharMessage(activeCharacter.id, {
        id: `u_${Date.now()}`,
        sender: 'user',
        text: result.userText,
        timestamp: Date.now(),
      });

      appendCharMessage(activeCharacter.id, {
        id: `a_${Date.now() + 1}`,
        sender: 'ai',
        text: result.replyText,
        timestamp: Date.now(),
        audioBase64: result.audioBase64,
        mimeType: result.mimeType,
      });

      await playAiResponse(result.audioBase64, result.mimeType);
    } catch (err) {
      setVoiceState('error');
      setError((err as Error).message || 'خطا در ارسال پیام صوتی.');
    }
  };

  const handleGameTextOrAudio = async (payload: {
    userText?: string;
    audioBase64?: string;
    audioMimeType?: string;
  }) => {
    if (!gameCharacter) return;
    playerRef.current?.unlock();
    const key = `${selectedGameId}:${gameCharacter.id}`;

    if (
      interactionMode === 'realtime' &&
      payload.userText &&
      (voiceState === 'listening' || voiceState === 'speaking')
    ) {
      appendGameMessage(key, {
        id: `gu_${Date.now()}`,
        sender: 'user',
        text: payload.userText,
        timestamp: Date.now(),
      });
      liveClientRef.current?.sendText(payload.userText);
      return;
    }

    setError(null);
    setVoiceState('thinking');

    try {
      const result = await apiClient.sendGameTurn({
        sessionId,
        gameId: selectedGameId,
        characterId: gameCharacter.id,
        topic: gameTopic,
        ...payload,
      });

      appendGameMessage(key, {
        id: `gu_${Date.now()}`,
        sender: 'user',
        text: result.userText,
        timestamp: Date.now(),
      });

      appendGameMessage(key, {
        id: `ga_${Date.now() + 1}`,
        sender: 'ai',
        text: result.replyText,
        timestamp: Date.now(),
        audioBase64: result.audioBase64,
        mimeType: result.mimeType,
      });

      await playAiResponse(result.audioBase64, result.mimeType);
    } catch (err) {
      setVoiceState('error');
      setError((err as Error).message || 'خطا در ادامه بازی.');
    }
  };

  const handleMicAction = async (mode: 'chat' | 'game', topicArg?: string) => {
    playerRef.current?.unlock();

    if (interactionMode === 'realtime') {
      await handleStartOrStopRealtime(mode, topicArg);
      return;
    }

    setError(null);

    if (voiceState === 'speaking') {
      playerRef.current?.stop();
      setIsPaused(false);
    }

    if (voiceState === 'listening') {
      try {
        const recorded = await recorderRef.current!.stop();
        setInterimTranscript('');

        if (!recorded.transcript && !recorded.audioBase64) {
          setVoiceState('idle');
          setError('صدایی ضبط نشد. لطفاً دوباره امتحان کنید.');
          return;
        }

        const payload = recorded.transcript
          ? { userText: recorded.transcript }
          : { audioBase64: recorded.audioBase64, audioMimeType: recorded.mimeType };

        if (mode === 'chat') {
          await handleChatTextOrAudio(payload);
        } else {
          await handleGameTextOrAudio(payload);
        }
      } catch (err) {
        setVoiceState('error');
        setError((err as Error).message || 'خطا در پردازش صدای ضبط‌شده.');
      }
      return;
    }

    try {
      setInterimTranscript('');
      await recorderRef.current!.start((text) => setInterimTranscript(text));
      setVoiceState('listening');
    } catch (err) {
      setVoiceState('error');
      setError((err as Error).message || 'امکان دسترسی به میکروفون وجود ندارد.');
    }
  };

  const handleSelectCharacter = (character: Character) => {
    stopAllActiveVoice();
    setActiveCharacterId(character.id);
    setTab('chat');
  };

  const handleResetChat = async () => {
    if (!activeCharacter) return;
    stopAllActiveVoice();
    await apiClient.resetMemory(sessionId, `char:${activeCharacter.id}`).catch(() => undefined);
    setCharMessages((prev) => ({ ...prev, [activeCharacter.id]: [] }));
  };

  const handleSelectGame = (gameId: GameModeId) => {
    stopAllActiveVoice();
    setSelectedGameId(gameId);
    const game = games.find((g) => g.id === gameId);
    if (game) {
      setGameCharacterId(game.defaultCharacterId);
    }
  };

  const handleStartGame = async (topic?: string) => {
    if (!gameCharacter) return;
    playerRef.current?.unlock();
    setError(null);
    stopAllActiveVoice();
    setGameTopic(topic);
    setVoiceState('thinking');

    const key = `${selectedGameId}:${gameCharacter.id}`;
    try {
      const result = await apiClient.startGame({
        sessionId,
        gameId: selectedGameId,
        characterId: gameCharacter.id,
        topic,
      });

      setGameMessages((prev) => ({
        ...prev,
        [key]: [
          {
            id: `gs_${Date.now()}`,
            sender: 'ai',
            text: result.replyText,
            timestamp: Date.now(),
            audioBase64: result.audioBase64,
            mimeType: result.mimeType,
          },
        ],
      }));

      await playAiResponse(result.audioBase64, result.mimeType);
    } catch (err) {
      setVoiceState('error');
      setError((err as Error).message || 'خطا در شروع بازی.');
    }
  };

  const handleReplayMessage = async (msg: ChatMessage) => {
    if (!msg.audioBase64 || !msg.mimeType) return;
    playerRef.current?.unlock();
    await playAiResponse(msg.audioBase64, msg.mimeType);
  };

  const handleSwitchTab = (nextTab: ScreenTab) => {
    stopAllActiveVoice();
    setTab(nextTab);
  };

  const handleChangeInteractionMode = (nextMode: VoiceInteractionMode) => {
    stopAllActiveVoice();
    setInteractionMode(nextMode);
  };

  const handleToggleEchoGuard = () => {
    setEchoGuard((prev) => {
      const next = !prev;
      liveClientRef.current?.setEchoGuard(next);
      return next;
    });
  };

  const handleInterruptRealtime = (mode: 'chat' | 'game') => {
    const targetChar = mode === 'chat' ? activeCharacter : gameCharacter;
    if (targetChar && liveOutputRef.current.trim()) {
      const finalizedOutput = liveOutputRef.current.trim();
      liveOutputRef.current = '';
      setLiveOutputDraft('');
      const aiMsg: ChatMessage = {
        id: `la_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sender: 'ai',
        text: finalizedOutput,
        timestamp: Date.now(),
      };
      if (mode === 'chat') {
        appendCharMessage(targetChar.id, aiMsg);
      } else {
        appendGameMessage(`${selectedGameId}:${targetChar.id}`, aiMsg);
      }
    }
    liveClientRef.current?.interrupt();
  };

  const aiUnavailable = Boolean(health && !health.configured);
  const activeGameKey = gameCharacter ? `${selectedGameId}:${gameCharacter.id}` : '';

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleSwitchTab('chat');
          }}
          className="text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          هم‌صحبت
        </a>

        <nav className="flex flex-wrap items-center gap-5 sm:gap-6" aria-label="منوی اصلی">
          <button
            type="button"
            onClick={() => handleSwitchTab('chat')}
            className={`whitespace-nowrap shrink-0 border-b-2 pb-1.5 text-sm font-semibold transition-colors ${
              tab === 'chat'
                ? 'border-[#ff7a2f] text-white'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            گفتگوی صوتی
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('assistant')}
            className={`whitespace-nowrap shrink-0 border-b-2 pb-1.5 text-sm font-semibold transition-colors ${
              tab === 'assistant'
                ? 'border-[#ff7a2f] text-white'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            چت هوشمند
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('characters')}
            className={`whitespace-nowrap shrink-0 border-b-2 pb-1.5 text-sm font-semibold transition-colors ${
              tab === 'characters'
                ? 'border-[#ff7a2f] text-white'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            شخصیت‌ها
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('games')}
            className={`whitespace-nowrap shrink-0 border-b-2 pb-1.5 text-sm font-semibold transition-colors ${
              tab === 'games'
                ? 'border-[#ff7a2f] text-white'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            بازی‌های صوتی
          </button>
        </nav>

        <button
          type="button"
          onClick={() => handleSwitchTab('characters')}
          className="hidden sm:inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-xl border border-white/12 bg-[#161a24] px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-[#1fe0c5]/60"
        >
          <Users className="h-3.5 w-3.5 text-[#1fe0c5]" />
          <span>انتخاب شخصیت</span>
        </button>
      </header>

      <ConfigBanner
        health={health}
        error={error}
        onDismissError={() => setError(null)}
      />

      <main className="flex flex-1 flex-col">
        {tab === 'chat' && activeCharacter && (
          <MainVoiceScreen
            characters={characters}
            activeCharacter={activeCharacter}
            messages={charMessages[activeCharacter.id] || []}
            voiceState={voiceState}
            interactionMode={interactionMode}
            echoGuard={echoGuard}
            interimTranscript={interimTranscript}
            liveOutputDraft={liveOutputDraft}
            isPaused={isPaused}
            disabled={aiUnavailable}
            getWaveformLevels={getWaveformLevels}
            onChangeInteractionMode={handleChangeInteractionMode}
            onToggleEchoGuard={handleToggleEchoGuard}
            onInterruptRealtime={() => handleInterruptRealtime('chat')}
            onSelectCharacter={handleSelectCharacter}
            onMicAction={() => handleMicAction('chat')}
            onSendText={(text) => handleChatTextOrAudio({ userText: text })}
            onTogglePause={() => setIsPaused(playerRef.current?.togglePause() || false)}
            onStopAudio={() => {
              playerRef.current?.stop();
              setVoiceState('idle');
              setIsPaused(false);
            }}
            onReplayMessage={handleReplayMessage}
            onResetConversation={handleResetChat}
          />
        )}

        {tab === 'assistant' && (
          <ChatGptScreen
            characters={characters}
            disabled={aiUnavailable}
            onError={setError}
          />
        )}

        {tab === 'characters' && (
          <CharacterSelectionScreen
            characters={characters}
            activeCharacterId={activeCharacterId}
            onStartConversation={handleSelectCharacter}
          />
        )}

        {tab === 'games' && gameCharacter && (
          <GamesScreen
            games={games}
            characters={characters}
            selectedGameId={selectedGameId}
            selectedCharacter={gameCharacter}
            messages={gameMessages[activeGameKey] || []}
            voiceState={voiceState}
            interactionMode={interactionMode}
            echoGuard={echoGuard}
            interimTranscript={interimTranscript}
            liveOutputDraft={liveOutputDraft}
            isPaused={isPaused}
            disabled={aiUnavailable}
            getWaveformLevels={getWaveformLevels}
            onChangeInteractionMode={handleChangeInteractionMode}
            onToggleEchoGuard={handleToggleEchoGuard}
            onInterruptRealtime={() => handleInterruptRealtime('game')}
            onSelectGame={handleSelectGame}
            onSelectCharacter={(id) => {
              stopAllActiveVoice();
              setGameCharacterId(id);
            }}
            onStartGame={handleStartGame}
            onMicAction={(topic) => handleMicAction('game', topic)}
            onSendText={(text) => handleGameTextOrAudio({ userText: text })}
            onTogglePause={() => setIsPaused(playerRef.current?.togglePause() || false)}
            onStopAudio={() => {
              playerRef.current?.stop();
              setVoiceState('idle');
              setIsPaused(false);
            }}
            onReplayMessage={handleReplayMessage}
          />
        )}
      </main>
    </div>
  );
}
