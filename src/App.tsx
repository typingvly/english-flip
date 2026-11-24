import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Settings, Trophy } from 'lucide-react';
import { LeaderboardModal } from './components/LeaderboardModal';
import { NicknameModal } from './components/NicknameModal';
import { RankModal } from './components/RankModal';
import { ResultModal } from './components/ResultModal';
import { SettingsModal } from './components/SettingsModal';
import { StartOverlay } from './components/StartOverlay';
import { TimeBar } from './components/TimeBar';
import { FONTS } from './data/fonts';
import {
  DEFAULT_CUSTOM_THEME,
  isValidThemeId,
  resolveTheme,
  sanitizeCustomTheme,
} from './data/themes';
import { WORDS, shuffleWords } from './data/words';
import {
  fetchPlayerLeaderboardEntry,
  getOrCreatePlayerId,
  loadSavedNickname,
  registerOrRenameNickname,
  saveLocalNickname,
  syncPersonalBestToLeaderboard,
} from './services/leaderboard';
import {
  DifficultySpeed,
  GameSettings,
  GameStatus,
  TeamOwner,
  TileItem,
} from './types/game';
import { playFlipSound, playTypeSound } from './utils/sound';

const GAME_DURATION_SEC = 60;
const COUNTDOWN_SECONDS = 3;
const BEST_STORAGE_KEY = 'flipTypingBest';
const SETTINGS_STORAGE_KEY = 'flipTypingSettings';

const DEFAULT_SETTINGS: GameSettings = {
  themeId: 'classic',
  customTheme: DEFAULT_CUSTOM_THEME,
  fontId: 'plus-jakarta',
  swapSides: false,
  sfxEnabled: true,
  sfxVolume: 60,
  sfxTyping: true,
  sfxFlip: true,
  preventEmptySpace: true,
  showTimeBar: true,
  hideScores: false,
  hideTimer: false,
  showMetricsBar: true,
  showMetricsTime: true,
  showMetricsCpm: true,
  showMetricsRawCpm: true,
  metricsInterval: 1.0,
};

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings> & { fontDefaultV2?: boolean };
    const themeId = isValidThemeId(parsed.themeId) ? parsed.themeId : 'classic';
    const customTheme = sanitizeCustomTheme(parsed.customTheme);
    const fontId =
      parsed.fontDefaultV2 && parsed.fontId && parsed.fontId in FONTS
        ? parsed.fontId
        : 'plus-jakarta';
    const sfxVolume =
      typeof parsed.sfxVolume === 'number' && Number.isFinite(parsed.sfxVolume)
        ? Math.max(0, Math.min(100, Math.round(parsed.sfxVolume)))
        : 60;
    const interval =
      typeof parsed.metricsInterval === 'number' && Number.isFinite(parsed.metricsInterval)
        ? Math.max(0.3, Math.round(parsed.metricsInterval * 10) / 10)
        : 1.0;

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      themeId,
      customTheme,
      fontId,
      sfxVolume,
      metricsInterval: interval,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadBestFlips(): number {
  try {
    const val = Number(localStorage.getItem(BEST_STORAGE_KEY) || 0);
    return Number.isFinite(val) ? val : 0;
  } catch {
    return 0;
  }
}

function createInitialTiles(swapSides: boolean): TileItem[] {
  return shuffleWords(WORDS)
    .slice(0, 60)
    .map((word, index) => ({
      id: index,
      word,
      owner: (swapSides ? index % 12 >= 6 : index % 12 < 6) ? 'ai' : 'user',
      flipKey: 0,
      lastFlippedBy: null,
    }));
}

function mirrorTilesHorizontally(list: TileItem[]): TileItem[] {
  const mirrored: TileItem[] = new Array(list.length);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 12; col++) {
      const srcIdx = row * 12 + col;
      const dstIdx = row * 12 + (11 - col);
      mirrored[dstIdx] = list[srcIdx];
    }
  }
  return mirrored;
}

function pickReplacementWord(tiles: TileItem[], targetId: number): string {
  const used = new Set(
    tiles.filter((t) => t.id !== targetId).map((t) => t.word.toLowerCase()),
  );
  const available = WORDS.filter((w) => !used.has(w.toLowerCase()));
  if (available.length === 0) {
    const current = tiles.find((t) => t.id === targetId);
    return current ? current.word : WORDS[0];
  }
  return available[Math.floor(Math.random() * available.length)];
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function getTileFontSize(wordLength: number): string {
  if (wordLength <= 3) return 'clamp(15px, 1.85vw, 23px)';
  if (wordLength <= 5) return 'clamp(13.5px, 1.55vw, 20px)';
  if (wordLength <= 7) return 'clamp(11.5px, 1.25vw, 16px)';
  if (wordLength === 8) return 'clamp(10px, 1.08vw, 14px)';
  return 'clamp(9px, 0.94vw, 12.5px)';
}

export default function App() {
  const [playerId] = useState<string>(getOrCreatePlayerId);
  const [nickname, setNickname] = useState<string>(loadSavedNickname);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [bestFlips, setBestFlips] = useState<number>(loadBestFlips);
  const [status, setStatus] = useState<GameStatus>('IDLE');
  const [aiSpeed, setAiSpeed] = useState<DifficultySpeed>(400);
  const [tiles, setTiles] = useState<TileItem[]>(() => createInitialTiles(settings.swapSides));
  const [flips, setFlips] = useState<number>(0);
  const [aiFlips, setAiFlips] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(GAME_DURATION_SEC);
  const [timeProgress, setTimeProgress] = useState<number>(1);
  const [inputValue, setInputValue] = useState<string>('');
  const [shakingInput, setShakingInput] = useState<boolean>(false);
  const [activeFlipIds, setActiveFlipIds] = useState<Record<number, TeamOwner>>({});
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [ranksOpen, setRanksOpen] = useState<boolean>(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState<boolean>(false);
  const [countdownLeft, setCountdownLeft] = useState<number>(COUNTDOWN_SECONDS);

  const [metricsSnapshot, setMetricsSnapshot] = useState<{
    timeLeft: number;
    cpm: number;
    rawCpm: number;
  }>({
    timeLeft: GAME_DURATION_SEC,
    cpm: 0,
    rawCpm: 0,
  });

  const theme = resolveTheme(settings.themeId, settings.customTheme);
  const activeFont = FONTS[settings.fontId] ?? FONTS['plus-jakarta'];

  useEffect(() => {
    document.documentElement.style.setProperty('--typing-font', activeFont.family);
  }, [activeFont.family]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const statusRef = useRef<GameStatus>(status);
  const tilesRef = useRef<TileItem[]>(tiles);
  const flipsRef = useRef<number>(flips);
  const bestFlipsRef = useRef<number>(bestFlips);
  const nicknameRef = useRef<string>(nickname);
  const aiSpeedRef = useRef<DifficultySpeed>(aiSpeed);
  const swapSidesRef = useRef<boolean>(settings.swapSides);
  const startTimeRef = useRef<number>(0);
  const endTimeRef = useRef<number>(0);
  const correctCharsRef = useRef<number>(0);
  const rawCharsRef = useRef<number>(0);
  const aiTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const flipTimeoutsRef = useRef<Record<number, number>>({});

  statusRef.current = status;
  tilesRef.current = tiles;
  flipsRef.current = flips;
  bestFlipsRef.current = bestFlips;
  nicknameRef.current = nickname;
  aiSpeedRef.current = aiSpeed;

  // Keep local nickname & bestFlips reconciled with Firestore leaderboard entry on startup
  useEffect(() => {
    let cancelled = false;
    void fetchPlayerLeaderboardEntry(playerId)
      .then((entry) => {
        if (cancelled || !entry) return;
        if (entry.nickname && entry.nickname !== nicknameRef.current) {
          saveLocalNickname(entry.nickname);
          setNickname(entry.nickname);
        }
        if (entry.bestFlips > bestFlipsRef.current) {
          try {
            localStorage.setItem(BEST_STORAGE_KEY, String(entry.bestFlips));
          } catch {
            // Ignore storage errors
          }
          setBestFlips(entry.bestFlips);
        } else if (bestFlipsRef.current > entry.bestFlips && entry.nickname) {
          void syncPersonalBestToLeaderboard({
            playerId,
            nickname: entry.nickname,
            bestFlips: bestFlipsRef.current,
          }).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const handleRegisterOrRenameNickname = useCallback(
    async (nextNickname: string) => {
      const res = await registerOrRenameNickname({
        playerId,
        nextNickname,
        initialBestFlips: bestFlipsRef.current,
      });
      setNickname(res.nickname);
      if (res.bestFlips > bestFlipsRef.current) {
        try {
          localStorage.setItem(BEST_STORAGE_KEY, String(res.bestFlips));
        } catch {
          // Ignore storage errors
        }
        setBestFlips(res.bestFlips);
      }
    },
    [playerId],
  );

  useEffect(() => {
    if (swapSidesRef.current !== settings.swapSides) {
      swapSidesRef.current = settings.swapSides;
      setTiles((prev) => {
        const next = mirrorTilesHorizontally(prev);
        tilesRef.current = next;
        return next;
      });
    }
  }, [settings.swapSides]);

  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSettings((prev) => {
      const next: GameSettings = {
        ...prev,
        ...patch,
      };
      if (patch.metricsInterval !== undefined) {
        next.metricsInterval = Math.max(0.3, Math.round(patch.metricsInterval * 10) / 10);
      }
      try {
        localStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify({ ...next, fontDefaultV2: true }),
        );
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const clearTimers = useCallback(() => {
    if (aiTimerRef.current !== null) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const triggerTileFlipAnimation = useCallback((tileId: number, team: TeamOwner) => {
    if (flipTimeoutsRef.current[tileId]) {
      window.clearTimeout(flipTimeoutsRef.current[tileId]);
    }
    setActiveFlipIds((prev) => ({ ...prev, [tileId]: team }));
    flipTimeoutsRef.current[tileId] = window.setTimeout(() => {
      setActiveFlipIds((prev) => {
        const next = { ...prev };
        delete next[tileId];
        return next;
      });
      delete flipTimeoutsRef.current[tileId];
    }, 270);
  }, []);

  const flipTile = useCallback(
    (tileId: number, team: TeamOwner) => {
      setTiles((prev) => {
        const next = prev.map((t) => {
          if (t.id !== tileId) return t;
          const nextWord = pickReplacementWord(prev, tileId);
          return {
            ...t,
            owner: team,
            word: nextWord,
            flipKey: t.flipKey + 1,
            lastFlippedBy: team,
          };
        });
        tilesRef.current = next;
        return next;
      });

      triggerTileFlipAnimation(tileId, team);

      if (team === 'user') {
        setFlips((prev) => {
          const next = prev + 1;
          flipsRef.current = next;
          return next;
        });
      } else {
        setAiFlips((prev) => prev + 1);
      }
    },
    [triggerTileFlipAnimation],
  );

  const computeCurrentRates = useCallback(() => {
    const now = performance.now();
    const elapsedSec = Math.max(0, (now - startTimeRef.current) / 1000);
    if (elapsedSec < 0.25) {
      return { cpm: 0, rawCpm: 0 };
    }
    const cpm = Math.round((correctCharsRef.current / elapsedSec) * 60);
    const rawCpm = Math.round((rawCharsRef.current / elapsedSec) * 60);
    return { cpm, rawCpm };
  }, []);

  const finishGame = useCallback(() => {
    if (statusRef.current === 'FINISHED') return;
    clearTimers();
    statusRef.current = 'FINISHED';
    setStatus('FINISHED');
    setTimeLeft(0);
    setTimeProgress(0);

    const elapsedSec = GAME_DURATION_SEC;
    const finalCpm = Math.round((correctCharsRef.current / elapsedSec) * 60);
    const finalRawCpm = Math.round((rawCharsRef.current / elapsedSec) * 60);
    setMetricsSnapshot({
      timeLeft: 0,
      cpm: finalCpm,
      rawCpm: finalRawCpm,
    });

    const currentFlips = flipsRef.current;
    const nextBest = Math.max(currentFlips, bestFlipsRef.current);
    if (currentFlips > bestFlipsRef.current) {
      try {
        localStorage.setItem(BEST_STORAGE_KEY, String(currentFlips));
      } catch {
        // Ignore storage errors
      }
      setBestFlips(currentFlips);
    }
    if (nicknameRef.current) {
      void syncPersonalBestToLeaderboard({
        playerId,
        nickname: nicknameRef.current,
        bestFlips: nextBest,
      }).catch(() => {});
    }
  }, [clearTimers, playerId]);

  const scheduleAI = useCallback(() => {
    if (statusRef.current !== 'PLAYING') return;
    const candidates = tilesRef.current.filter((t) => t.owner === 'user');
    if (candidates.length === 0) {
      aiTimerRef.current = window.setTimeout(scheduleAI, 100);
      return;
    }
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const delay = Math.max(80, (target.word.length * 60000) / aiSpeedRef.current);

    aiTimerRef.current = window.setTimeout(() => {
      if (statusRef.current !== 'PLAYING') return;
      const latest = tilesRef.current.find((t) => t.id === target.id);
      if (latest && latest.owner === 'user') {
        flipTile(target.id, 'ai');
      }
      scheduleAI();
    }, delay);
  }, [flipTile]);

  const beginActivePlay = useCallback(() => {
    clearTimers();
    const freshTiles = createInitialTiles(swapSidesRef.current);
    tilesRef.current = freshTiles;
    setTiles(freshTiles);

    const now = performance.now();
    startTimeRef.current = now;
    endTimeRef.current = now + GAME_DURATION_SEC * 1000;

    statusRef.current = 'PLAYING';
    setStatus('PLAYING');

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    scheduleAI();

    const tick = () => {
      if (statusRef.current !== 'PLAYING') return;
      const remainingMs = Math.max(0, endTimeRef.current - performance.now());
      const progress = remainingMs / (GAME_DURATION_SEC * 1000);
      const ceilSec = Math.ceil(remainingMs / 1000);

      setTimeProgress(progress);
      setTimeLeft(ceilSec);

      if (remainingMs <= 0) {
        finishGame();
        return;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [clearTimers, finishGame, scheduleAI]);

  const startGame = useCallback(() => {
    clearTimers();
    const blankResetTiles = createInitialTiles(swapSidesRef.current);
    tilesRef.current = blankResetTiles;
    setTiles(blankResetTiles);
    setFlips(0);
    flipsRef.current = 0;
    setAiFlips(0);
    setTimeLeft(GAME_DURATION_SEC);
    setTimeProgress(1);
    setInputValue('');
    setActiveFlipIds({});
    correctCharsRef.current = 0;
    rawCharsRef.current = 0;
    setMetricsSnapshot({
      timeLeft: GAME_DURATION_SEC,
      cpm: 0,
      rawCpm: 0,
    });

    setCountdownLeft(COUNTDOWN_SECONDS);
    statusRef.current = 'COUNTDOWN';
    setStatus('COUNTDOWN');

    const countdownEnd = performance.now() + COUNTDOWN_SECONDS * 1000;
    countdownTimerRef.current = window.setInterval(() => {
      if (statusRef.current !== 'COUNTDOWN') return;
      const remainingMs = countdownEnd - performance.now();
      if (remainingMs <= 0) {
        if (countdownTimerRef.current !== null) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        beginActivePlay();
        return;
      }
      setCountdownLeft(Math.ceil(remainingMs / 1000));
    }, 100);
  }, [beginActivePlay, clearTimers]);

  const resetToIdle = useCallback(() => {
    clearTimers();
    const initialTiles = createInitialTiles(swapSidesRef.current);
    tilesRef.current = initialTiles;
    setTiles(initialTiles);
    setFlips(0);
    flipsRef.current = 0;
    setAiFlips(0);
    setTimeLeft(GAME_DURATION_SEC);
    setTimeProgress(1);
    setInputValue('');
    setActiveFlipIds({});
    correctCharsRef.current = 0;
    rawCharsRef.current = 0;
    setMetricsSnapshot({
      timeLeft: GAME_DURATION_SEC,
      cpm: 0,
      rawCpm: 0,
    });
    statusRef.current = 'IDLE';
    setStatus('IDLE');
  }, [clearTimers]);

  // Periodic snapshot for the compact metrics bar (respecting configured interval >= 0.3s)
  useEffect(() => {
    if (status !== 'PLAYING') return;

    const intervalMs = Math.max(0.3, settings.metricsInterval) * 1000;
    const id = window.setInterval(() => {
      if (statusRef.current !== 'PLAYING') return;
      const remainingMs = Math.max(0, endTimeRef.current - performance.now());
      const sec = Math.ceil(remainingMs / 1000);
      const { cpm, rawCpm } = computeCurrentRates();
      setMetricsSnapshot({
        timeLeft: sec,
        cpm,
        rawCpm,
      });
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [status, settings.metricsInterval, computeCurrentRates]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      Object.values(flipTimeoutsRef.current).forEach((t) => window.clearTimeout(t));
    };
  }, [clearTimers]);

  const submitWord = useCallback(() => {
    if (statusRef.current !== 'PLAYING') return;
    const trimmed = inputValue.trim().toLowerCase();
    setInputValue('');
    if (!trimmed) return;

    const match = tilesRef.current.find(
      (t) => t.owner === 'ai' && t.word.toLowerCase() === trimmed,
    );

    if (!match) {
      setShakingInput(true);
      window.setTimeout(() => setShakingInput(false), 190);
      if (settings.sfxEnabled && settings.sfxTyping) {
        playTypeSound(settings.sfxVolume);
      }
      return;
    }

    correctCharsRef.current += match.word.length + 1;
    if (settings.sfxEnabled && settings.sfxFlip) {
      playFlipSound(settings.sfxVolume);
    }
    flipTile(match.id, 'user');
  }, [flipTile, inputValue, settings.sfxEnabled, settings.sfxFlip, settings.sfxTyping, settings.sfxVolume]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.code === 'Space') {
      if (inputValue.length === 0) {
        if (settings.preventEmptySpace) {
          e.preventDefault();
          return;
        }
        // When preventEmptySpace is OFF, let the space character enter via onChange
        return;
      }

      if (inputValue.trim().length === 0 && settings.preventEmptySpace) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      rawCharsRef.current += 1;
      submitWord();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputValue.trim().length > 0) {
        rawCharsRef.current += 1;
      }
      submitWord();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (settings.preventEmptySpace && inputValue.length === 0 && next.trim().length === 0) {
      setInputValue('');
      return;
    }
    if (next.length > inputValue.length) {
      rawCharsRef.current += next.length - inputValue.length;
    }
    if (next !== inputValue && settings.sfxEnabled && settings.sfxTyping) {
      playTypeSound(settings.sfxVolume);
    }
    setInputValue(next);
  };

  const matchedWord = useMemo(() => {
    const trimmed = inputValue.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : '';
  }, [inputValue]);

  const hasVisibleMetricItems =
    settings.showMetricsTime || settings.showMetricsCpm || settings.showMetricsRawCpm;

  const userTileCount = useMemo(
    () => tiles.filter((t) => t.owner === 'user').length,
    [tiles],
  );
  const aiTileCount = 60 - userTileCount;

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-between transition-colors duration-200"
      style={{
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      {/* Top Progress Bar */}
      <TimeBar visible={settings.showTimeBar} progress={timeProgress} theme={theme} />

      <div className="w-full max-w-[1320px] mx-auto px-4 sm:px-8 pt-6 pb-8 flex-1 flex flex-col justify-between">
        {/* Top Bar (kept above StartOverlay so user can customize live anytime) */}
        <header className="relative z-30 flex items-start justify-between gap-4">
          <div className="flex flex-col items-start">
            <span className="text-xl sm:text-2xl font-bold tracking-tight whitespace-nowrap select-none">
              <span style={{ color: theme.text }}>English</span>
              <span style={{ color: theme.accent }}>Flip</span>
            </span>

            {/* Compact Single-Line Metrics Bar right below title (raw values only, zero labels) */}
            {settings.showMetricsBar && hasVisibleMetricItems && (
              <div
                className="mt-1.5 flex items-center gap-6 font-mono-typing text-xl sm:text-2xl font-semibold tabular-nums tracking-tight select-none"
                style={{ color: theme.text }}
              >
                {settings.showMetricsTime && (
                  <span>{formatClock(metricsSnapshot.timeLeft)}</span>
                )}
                {settings.showMetricsCpm && <span>{metricsSnapshot.cpm}</span>}
                {settings.showMetricsRawCpm && <span>{metricsSnapshot.rawCpm}</span>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {(status === 'PLAYING' || status === 'COUNTDOWN') && (
              <button
                type="button"
                onClick={resetToIdle}
                className="h-10 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-opacity hover:opacity-85 cursor-pointer whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: theme.surface,
                  color: theme.muted,
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>초기화</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setLeaderboardOpen(true)}
              aria-label="리더보드"
              title="리더보드"
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-opacity hover:opacity-85 cursor-pointer shrink-0"
              style={{
                backgroundColor: theme.surface,
                color: theme.text,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <path d="M2 20h20" />
                <rect x="3" y="12" width="5" height="8" rx="1" />
                <rect x="9.5" y="6" width="5" height="14" rx="1" />
                <rect x="16" y="14" width="5" height="6" rx="1" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setRanksOpen(true)}
              aria-label="랭크"
              title="랭크"
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-opacity hover:opacity-85 cursor-pointer shrink-0"
              style={{
                backgroundColor: theme.userTile,
                color: theme.userTileText,
              }}
            >
              <Trophy className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="설정"
              title="설정"
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-opacity hover:opacity-85 cursor-pointer shrink-0"
              style={{
                backgroundColor: theme.aiTile,
                color: theme.aiTileText,
              }}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Game Area */}
        <main className="my-auto py-4 sm:py-6 flex flex-col items-center">
          {/* HUD Strip */}
          {(!settings.hideScores || !settings.hideTimer) && (
            <section
              className="w-full max-w-[780px] grid grid-cols-3 items-end gap-4 mb-5 sm:mb-7"
              aria-label="경기 현황"
            >
              {/* User Score */}
              <div className="text-center">
                {!settings.hideScores && (
                  <>
                    <div
                      className="inline-flex items-center gap-1.5 text-xs font-medium"
                      style={{ color: theme.muted }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-[3px] inline-block"
                        style={{ backgroundColor: theme.userTile }}
                        aria-hidden="true"
                      />
                      <span>내 점수</span>
                    </div>
                    <div className="font-mono-typing text-3xl sm:text-4xl font-medium tabular-nums mt-1">
                      {flips}
                    </div>
                  </>
                )}
              </div>

              {/* Center Timer */}
              <div className="text-center">
                {!settings.hideTimer && (
                  <>
                    <div className="text-xs font-medium" style={{ color: theme.muted }}>
                      남은 시간
                    </div>
                    <div
                      className="font-mono-typing text-3xl sm:text-4xl font-medium tabular-nums mt-1"
                      style={{ color: timeLeft <= 10 && status === 'PLAYING' ? theme.aiTile : theme.text }}
                    >
                      {formatClock(timeLeft)}
                    </div>
                  </>
                )}
              </div>

              {/* AI Score */}
              <div className="text-center">
                {!settings.hideScores && (
                  <>
                    <div
                      className="inline-flex items-center gap-1.5 text-xs font-medium"
                      style={{ color: theme.muted }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-[3px] inline-block"
                        style={{ backgroundColor: theme.aiTile }}
                        aria-hidden="true"
                      />
                      <span>봇 점수</span>
                    </div>
                    <div className="font-mono-typing text-3xl sm:text-4xl font-medium tabular-nums mt-1">
                      {aiFlips}
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {/* 12x5 Word Flip Board (no backdrop box underneath) */}
          <section
            aria-label="영어 단어 판뒤집기 보드"
            className="relative w-full"
          >
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 sm:gap-2">
              {tiles.map((tile) => {
                const isUser = tile.owner === 'user';
                const flipAnim = activeFlipIds[tile.id];
                const isCountdown = status === 'COUNTDOWN';
                const isExactTarget =
                  !isCountdown &&
                  status === 'PLAYING' &&
                  !isUser &&
                  matchedWord === tile.word.toLowerCase();

                return (
                  <div
                    key={tile.id}
                    className={`min-h-[48px] sm:min-h-[64px] lg:min-h-[76px] rounded-[8px] flex items-center justify-center px-1 select-none overflow-hidden transition-[background-color,color,outline-color] duration-200 ${
                      flipAnim === 'user'
                        ? 'animate-tile-user'
                        : flipAnim === 'ai'
                          ? 'animate-tile-ai'
                          : ''
                    }`}
                    style={{
                      backgroundColor: isUser ? theme.userTile : theme.aiTile,
                      color: isUser ? theme.userTileText : theme.aiTileText,
                      outline: isExactTarget ? `2px solid ${theme.text}` : '2px solid transparent',
                      outlineOffset: '1px',
                    }}
                  >
                    {!isCountdown && (
                      <span
                        className="font-mono-typing font-medium tracking-[-0.025em] leading-none whitespace-nowrap"
                        style={{ fontSize: getTileFontSize(tile.word.length) }}
                      >
                        {tile.word}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {status === 'COUNTDOWN' && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                aria-live="assertive"
              >
                <div
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl shadow-xl flex items-center justify-center font-mono-typing text-5xl sm:text-6xl font-semibold tabular-nums"
                  style={{
                    backgroundColor: theme.surfaceElevated,
                    color: theme.text,
                  }}
                >
                  {countdownLeft}
                </div>
              </div>
            )}
          </section>

          {/* Subtle Board Territory Proportion Bar */}
          {!settings.hideScores && (
            <div className="w-full mt-2.5 flex items-center gap-2">
              <div
                className="flex-1 h-1 rounded-full overflow-hidden flex"
                style={{ backgroundColor: theme.surface }}
                aria-hidden="true"
              >
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${((settings.swapSides ? userTileCount : aiTileCount) / 60) * 100}%`,
                    backgroundColor: settings.swapSides ? theme.userTile : theme.aiTile,
                  }}
                />
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${((settings.swapSides ? aiTileCount : userTileCount) / 60) * 100}%`,
                    backgroundColor: settings.swapSides ? theme.aiTile : theme.userTile,
                  }}
                />
              </div>
            </div>
          )}

          {/* Theme-Harmonious Input Bar */}
          <div className="w-full max-w-[520px] mt-5 sm:mt-6">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              disabled={status !== 'PLAYING'}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={
                status === 'PLAYING'
                  ? '상대 색상의 단어를 입력하세요'
                  : status === 'COUNTDOWN'
                    ? `${countdownLeft}초 후 시작...`
                    : '게임 시작 전'
              }
              aria-label="영어 단어 입력"
              className={`w-full rounded-xl px-5 py-3.5 text-center font-mono-typing text-lg sm:text-xl font-medium outline-none transition-colors duration-150 disabled:opacity-45 ${
                shakingInput ? 'animate-input-shake' : ''
              }`}
              style={{
                backgroundColor: theme.surface,
                boxShadow: status === 'PLAYING' ? `0 0 0 2px ${theme.accent}` : 'none',
                color: theme.text,
                caretColor: theme.accent,
              }}
            />
            <div className="text-center text-xs mt-2.5" style={{ color: theme.muted }}>
              Space 또는 Enter로 단어 전환
            </div>
          </div>
        </main>

        {/* Quiet Minimal Footer */}
        <footer
          className="text-center text-xs pt-2 select-none"
          style={{ color: theme.muted }}
        >
          60s · {aiSpeed}타 모드 · {theme.name}
        </footer>
      </div>

      {/* Start Overlay */}
      <StartOverlay
        open={status === 'IDLE'}
        aiSpeed={aiSpeed}
        theme={theme}
        onSelectSpeed={setAiSpeed}
        onStart={startGame}
      />

      {/* Match Result Modal */}
      <ResultModal
        open={status === 'FINISHED'}
        flips={flips}
        aiFlips={aiFlips}
        aiSpeed={aiSpeed}
        cpm={metricsSnapshot.cpm}
        rawCpm={metricsSnapshot.rawCpm}
        theme={theme}
        onRestart={resetToIdle}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        nickname={nickname}
        theme={theme}
        onUpdateSettings={updateSettings}
        onChangeNickname={handleRegisterOrRenameNickname}
        onClose={() => {
          setSettingsOpen(false);
          if (status === 'PLAYING') {
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }
        }}
      />

      {/* Rank System Modal */}
      <RankModal
        open={ranksOpen}
        bestFlips={bestFlips}
        theme={theme}
        onClose={() => {
          setRanksOpen(false);
          if (status === 'PLAYING') {
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }
        }}
      />

      {/* Global Leaderboard Modal */}
      <LeaderboardModal
        open={leaderboardOpen}
        playerId={playerId}
        nickname={nickname}
        theme={theme}
        onClose={() => {
          setLeaderboardOpen(false);
          if (status === 'PLAYING') {
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }
        }}
      />

      {/* Mandatory First-Visit Nickname Modal */}
      <NicknameModal
        open={!nickname}
        theme={theme}
        onSubmit={handleRegisterOrRenameNickname}
      />
    </div>
  );
}
