import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { LogIn, RotateCcw, Settings, Shield, Trophy, User } from 'lucide-react';
import { AdminConsole } from './components/AdminConsole';
import { LeaderboardModal } from './components/LeaderboardModal';
import { LegacyClaimModal } from './components/LegacyClaimModal';
import { MatchModeBar } from './components/MatchModeBar';
import { NicknameModal } from './components/NicknameModal';
import { ProfileModal } from './components/ProfileModal';
import { RankModal } from './components/RankModal';
import { ResultModal } from './components/ResultModal';
import { SettingsModal, SettingsTab } from './components/SettingsModal';
import { TimeBar } from './components/TimeBar';
import { FONTS } from './data/fonts';
import {
  DEFAULT_CUSTOM_THEME,
  isValidThemeId,
  resolveTheme,
  sanitizeCustomTheme,
} from './data/themes';
import { WORDS, shuffleWords } from './data/words';
import { auth } from './firebase';
import { COPY, getThemeDisplay } from './i18n/translations';
import { isAdminUser, submitModerationReport } from './services/admin';
import {
  claimLegacyPlayerEntry,
  clearLegacyClaimDismissed,
  dismissLegacyClaim,
  fetchUnclaimedLegacyEntry,
  isLegacyClaimDismissed,
  LegacyLeaderboardCandidate,
  migrateLegacyAdminEntryIfNeeded,
  signInPlayerWithGoogle,
  signOutPlayer,
} from './services/auth';
import {
  fetchPlayerControlState,
  fetchPlayerLeaderboardEntry,
  getOrCreatePlayerId,
  loadLocalBestFlips,
  loadLocalRecordEpoch,
  loadSavedNickname,
  registerOrRenameNickname,
  saveLocalBestFlips,
  saveLocalNickname,
  saveLocalRecordEpoch,
  subscribeOwnLeaderboardEntry,
  subscribeOwnPlayerControl,
  syncPersonalBestToLeaderboard,
} from './services/leaderboard';
import { applyServerProfileReset, recordVerifiedMatch } from './services/profile';
import {
  AppLanguage,
  DifficultySpeed,
  GameSettings,
  GameStatus,
  MatchReport,
  PaceBucket,
  PlayerControlState,
  TeamOwner,
  TileItem,
  WeakWordStat,
} from './types/game';
import {
  AntiCheatState,
  APPROVAL_THRESHOLD_FLIPS,
  createAntiCheatState,
  evaluateMatchIntegrity,
  getAntiCheatTelemetry,
  recordKeyInputSample,
} from './utils/antiCheat';
import {
  clearBackgroundImage,
  loadBackgroundImageUrl,
  processAndSaveBackgroundImage,
} from './utils/backgroundStorage';
import { playFlipSound, playTypeSound } from './utils/sound';

const DEFAULT_DURATION_SEC = 60;
const COUNTDOWN_SECONDS = 3;
const SETTINGS_STORAGE_KEY = 'flipTypingSettings';

const DEFAULT_SETTINGS: GameSettings = {
  language: 'ko',
  themeId: 'classic',
  customTheme: DEFAULT_CUSTOM_THEME,
  fontId: 'plus-jakarta',
  swapSides: false,
  focusMode: false,
  hasCustomBackground: false,
  backgroundBlur: 6,
  backgroundDim: 45,
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
    const language: AppLanguage = parsed.language === 'en' ? 'en' : 'ko';
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
    const backgroundBlur =
      typeof parsed.backgroundBlur === 'number' && Number.isFinite(parsed.backgroundBlur)
        ? Math.max(0, Math.min(24, Math.round(parsed.backgroundBlur)))
        : 6;
    const backgroundDim =
      typeof parsed.backgroundDim === 'number' && Number.isFinite(parsed.backgroundDim)
        ? Math.max(0, Math.min(85, Math.round(parsed.backgroundDim)))
        : 45;
    const interval =
      typeof parsed.metricsInterval === 'number' && Number.isFinite(parsed.metricsInterval)
        ? Math.max(0.3, Math.round(parsed.metricsInterval * 10) / 10)
        : 1.0;

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      language,
      themeId,
      customTheme,
      fontId,
      sfxVolume,
      backgroundBlur,
      backgroundDim,
      metricsInterval: interval,
    };
  } catch {
    return DEFAULT_SETTINGS;
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

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[n];
}

function findClosestAiWord(typed: string, tiles: TileItem[]): string {
  const aiWords = tiles.filter((t) => t.owner === 'ai').map((t) => t.word);
  let bestWord = typed;
  let bestDist = Infinity;
  for (const w of aiWords) {
    const low = w.toLowerCase();
    if (low.startsWith(typed) && typed.length >= 2) {
      return w;
    }
    const dist = editDistance(typed, low);
    if (dist < bestDist) {
      bestDist = dist;
      bestWord = w;
    }
  }
  return bestDist <= 2 ? bestWord : typed;
}

export default function App() {
  const [guestPlayerId] = useState<string>(getOrCreatePlayerId);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(() => auth.currentUser);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [headerAvatarError, setHeaderAvatarError] = useState<boolean>(false);
  const [needsNicknameSetup, setNeedsNicknameSetup] = useState<boolean>(false);
  const [nicknameModalDismissed, setNicknameModalDismissed] = useState<boolean>(false);
  const [pendingLegacyClaim, setPendingLegacyClaim] =
    useState<LegacyLeaderboardCandidate | null>(null);
  const [availableLegacyCandidate, setAvailableLegacyCandidate] =
    useState<LegacyLeaderboardCandidate | null>(null);

  const isSignedIn = Boolean(authUser && authUser.emailVerified);
  const activePlayerId = isSignedIn && authUser ? authUser.uid : guestPlayerId;

  const [nickname, setNickname] = useState<string>(() =>
    auth.currentUser && auth.currentUser.emailVerified
      ? loadSavedNickname(auth.currentUser.uid)
      : '',
  );
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [bestFlips, setBestFlips] = useState<number>(() =>
    auth.currentUser && auth.currentUser.emailVerified
      ? loadLocalBestFlips(auth.currentUser.uid, false)
      : loadLocalBestFlips(guestPlayerId, true),
  );
  const [status, setStatus] = useState<GameStatus>('IDLE');
  const [aiSpeed, setAiSpeed] = useState<DifficultySpeed>(400);
  const [durationSec, setDurationSec] = useState<number>(DEFAULT_DURATION_SEC);
  const [tiles, setTiles] = useState<TileItem[]>(() => createInitialTiles(settings.swapSides));
  const [flips, setFlips] = useState<number>(0);
  const [aiFlips, setAiFlips] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(DEFAULT_DURATION_SEC);
  const [timeProgress, setTimeProgress] = useState<number>(1);
  const [inputValue, setInputValue] = useState<string>('');
  const [shakingInput, setShakingInput] = useState<boolean>(false);
  const [activeFlipIds, setActiveFlipIds] = useState<Record<number, TeamOwner>>({});
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('design');
  const [ranksOpen, setRanksOpen] = useState<boolean>(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState<boolean>(false);
  const [profileOpen, setProfileOpen] = useState<boolean>(false);
  const [adminViewOpen, setAdminViewOpen] = useState<boolean>(false);
  const [countdownLeft, setCountdownLeft] = useState<number>(COUNTDOWN_SECONDS);
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  const [focusDimmed, setFocusDimmed] = useState<boolean>(false);
  const [pasteNotice, setPasteNotice] = useState<boolean>(false);
  const [matchReport, setMatchReport] = useState<MatchReport | null>(null);

  const [metricsSnapshot, setMetricsSnapshot] = useState<{
    timeLeft: number;
    cpm: number;
    rawCpm: number;
  }>({
    timeLeft: DEFAULT_DURATION_SEC,
    cpm: 0,
    rawCpm: 0,
  });

  const lang = settings.language;
  const t = COPY[lang].app;
  const theme = resolveTheme(settings.themeId, settings.customTheme);
  const themeDisplay = getThemeDisplay(theme, lang);
  const activeFont = FONTS[settings.fontId] ?? FONTS['plus-jakarta'];

  useEffect(() => {
    document.documentElement.style.setProperty('--typing-font', activeFont.family);
  }, [activeFont.family]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const customBgUrlRef = useRef<string | null>(null);
  const statusRef = useRef<GameStatus>(status);
  const tilesRef = useRef<TileItem[]>(tiles);
  const flipsRef = useRef<number>(flips);
  const aiFlipsRef = useRef<number>(aiFlips);
  const bestFlipsRef = useRef<number>(bestFlips);
  const nicknameRef = useRef<string>(nickname);
  const aiSpeedRef = useRef<DifficultySpeed>(aiSpeed);
  const durationSecRef = useRef<number>(durationSec);
  const swapSidesRef = useRef<boolean>(settings.swapSides);
  const startTimeRef = useRef<number>(0);
  const endTimeRef = useRef<number>(0);
  const correctCharsRef = useRef<number>(0);
  const rawCharsRef = useRef<number>(0);
  const wordAttemptStartRef = useRef<number | null>(null);
  const bucketCharsRef = useRef<number[]>([0, 0, 0, 0, 0, 0]);
  const bucketFlipsRef = useRef<number[]>([0, 0, 0, 0, 0, 0]);
  const wordStatsMapRef = useRef<Record<string, { mistakes: number; totalMs: number; count: number }>>({});
  const antiCheatRef = useRef<AntiCheatState>(createAntiCheatState());
  const pasteTimeoutRef = useRef<number | null>(null);
  const aiTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const flipTimeoutsRef = useRef<Record<number, number>>({});

  statusRef.current = status;
  tilesRef.current = tiles;
  flipsRef.current = flips;
  aiFlipsRef.current = aiFlips;
  bestFlipsRef.current = bestFlips;
  nicknameRef.current = nickname;
  aiSpeedRef.current = aiSpeed;
  durationSecRef.current = durationSec;
  customBgUrlRef.current = customBgUrl;

  // Load persisted custom background from IndexedDB on mount
  useEffect(() => {
    let active = true;
    void loadBackgroundImageUrl().then((url) => {
      if (!active) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (url) {
        setCustomBgUrl(url);
      }
    });
    return () => {
      active = false;
      if (customBgUrlRef.current) {
        URL.revokeObjectURL(customBgUrlRef.current);
      }
    };
  }, []);

  // Track Firebase Auth user for Google Sign-In & Admin authentication
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setHeaderAvatarError(false);
    });
    return () => unsub();
  }, []);

  const applyServerControlDirective = useCallback(
    (ctrl: PlayerControlState) => {
      const localEpoch = loadLocalRecordEpoch(activePlayerId);
      if (ctrl.recordEpoch <= localEpoch) return;

      saveLocalRecordEpoch(activePlayerId, ctrl.recordEpoch);
      saveLocalBestFlips(ctrl.forcedBestFlips, activePlayerId);
      setBestFlips(ctrl.forcedBestFlips);
      setAvailableLegacyCandidate(null);
      setPendingLegacyClaim(null);
      applyServerProfileReset(activePlayerId, ctrl.forcedBestFlips, ctrl.isRemoved);

      if (ctrl.isRemoved) {
        saveLocalNickname('', activePlayerId);
        setNickname('');
        setAdminViewOpen(false);
      } else if (ctrl.forcedNickname && ctrl.forcedNickname !== nicknameRef.current) {
        saveLocalNickname(ctrl.forcedNickname, activePlayerId);
        setNickname(ctrl.forcedNickname);
      }
    },
    [activePlayerId],
  );

  // Auto-dismiss authError toast after 7 seconds
  useEffect(() => {
    if (!authError) return;
    const timer = window.setTimeout(() => setAuthError(null), 7000);
    return () => window.clearTimeout(timer);
  }, [authError]);

  // Keep signed-in player state reconciled with Firestore & cleanly isolate guest state
  useEffect(() => {
    if (!isSignedIn || !authUser) {
      setNickname('');
      setNeedsNicknameSetup(false);
      setPendingLegacyClaim(null);
      setAvailableLegacyCandidate(null);
      setBestFlips(loadLocalBestFlips(guestPlayerId, true));
      return;
    }

    let cancelled = false;
    const uid = authUser.uid;
    const localSavedNick = loadSavedNickname(uid);
    setNickname(localSavedNick);
    setBestFlips(loadLocalBestFlips(uid, false));

    let unsubCtrl: (() => void) | undefined;
    let unsubOwnLb: (() => void) | undefined;

    const initSignedInSync = async () => {
      if (isAdminUser(authUser)) {
        await migrateLegacyAdminEntryIfNeeded(authUser, guestPlayerId).catch(() => false);
      }
      if (cancelled) return;

      const ctrl = await fetchPlayerControlState(uid).catch(() => null);
      if (cancelled) return;
      if (ctrl) {
        applyServerControlDirective(ctrl);
      }
      const hasAdminControl = Boolean(ctrl && ctrl.recordEpoch > 0) || loadLocalRecordEpoch(uid) > 0;

      void fetchPlayerLeaderboardEntry(uid)
        .then(async (entry) => {
          if (cancelled) return;
          if (!entry) {
            const candidate = await fetchUnclaimedLegacyEntry(guestPlayerId);
            const allowedCandidate =
              candidate && (candidate.source === 'firestore' || !hasAdminControl)
                ? candidate
                : null;
            if (!cancelled && allowedCandidate) {
              setAvailableLegacyCandidate(allowedCandidate);
              if (!isLegacyClaimDismissed(uid, guestPlayerId)) {
                setPendingLegacyClaim(allowedCandidate);
                setNeedsNicknameSetup(false);
                return;
              }
            } else if (!cancelled) {
              setAvailableLegacyCandidate(null);
            }
            if (!cancelled) {
              setPendingLegacyClaim(null);
              setNeedsNicknameSetup(true);
            }
            return;
          }

          setPendingLegacyClaim(null);
          setNeedsNicknameSetup(false);
          if (entry.nickname && entry.nickname !== nicknameRef.current) {
            saveLocalNickname(entry.nickname, uid);
            setNickname(entry.nickname);
          }
          if (entry.bestFlips !== bestFlipsRef.current) {
            saveLocalBestFlips(entry.bestFlips, uid);
            setBestFlips(entry.bestFlips);
          }

          if (entry.bestFlips === 0 && !hasAdminControl) {
            const candidate = await fetchUnclaimedLegacyEntry(guestPlayerId);
            if (!cancelled && candidate && candidate.bestFlips > 0) {
              setAvailableLegacyCandidate(candidate);
            } else if (!cancelled) {
              setAvailableLegacyCandidate(null);
            }
          } else {
            setAvailableLegacyCandidate(null);
          }
        })
        .catch(() => {});

      unsubCtrl = subscribeOwnPlayerControl(uid, (ctrl) => {
        applyServerControlDirective(ctrl);
      });

      unsubOwnLb = subscribeOwnLeaderboardEntry(uid, (entry) => {
        if (!entry) return;
        setPendingLegacyClaim(null);
        if (entry.bestFlips > 0) {
          setAvailableLegacyCandidate(null);
        }
        setNeedsNicknameSetup(false);
        if (entry.nickname && entry.nickname !== nicknameRef.current) {
          saveLocalNickname(entry.nickname, uid);
          setNickname(entry.nickname);
        }
        if (entry.bestFlips !== bestFlipsRef.current) {
          saveLocalBestFlips(entry.bestFlips, uid);
          setBestFlips(entry.bestFlips);
        }
      });
    };

    void initSignedInSync();

    return () => {
      cancelled = true;
      unsubCtrl?.();
      unsubOwnLb?.();
    };
  }, [applyServerControlDirective, authUser, guestPlayerId, isSignedIn]);

  const handleSignInGoogle = useCallback(async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError(null);
    setNicknameModalDismissed(false);
    try {
      await signInPlayerWithGoogle(settings.language);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        const msg =
          err instanceof Error
            ? err.message
            : settings.language === 'en'
              ? 'Google sign-in failed.'
              : 'Google 로그인에 실패했습니다.';
        setAuthError(msg);
      }
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, settings.language]);

  const handleSignOutGoogle = useCallback(async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signOutPlayer();
      setAdminViewOpen(false);
      setNeedsNicknameSetup(false);
      setPendingLegacyClaim(null);
      setAvailableLegacyCandidate(null);
      setNicknameModalDismissed(false);
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy]);

  const handleClaimLegacyRecord = useCallback(
    async (chosenNickname?: string) => {
      if (!isSignedIn || !authUser || !pendingLegacyClaim) return;
      const res = await claimLegacyPlayerEntry({
        user: authUser,
        legacyPlayerId: pendingLegacyClaim.legacyPlayerId,
        chosenNickname,
        source: pendingLegacyClaim.source,
        lang: settings.language,
      });
      setNickname(res.nickname);
      saveLocalBestFlips(res.bestFlips, authUser.uid);
      setBestFlips(res.bestFlips);
      setPendingLegacyClaim(null);
      setAvailableLegacyCandidate(null);
      setNeedsNicknameSetup(false);
      setNicknameModalDismissed(false);
    },
    [authUser, isSignedIn, pendingLegacyClaim, settings.language],
  );

  const handleStartFreshFromLegacy = useCallback(() => {
    if (authUser && pendingLegacyClaim) {
      dismissLegacyClaim(authUser.uid, pendingLegacyClaim.legacyPlayerId);
    }
    setPendingLegacyClaim(null);
    setNeedsNicknameSetup(!nicknameRef.current);
    setNicknameModalDismissed(false);
  }, [authUser, pendingLegacyClaim]);

  const handleRegisterOrRenameNickname = useCallback(
    async (nextNickname: string) => {
      if (!isSignedIn || !authUser) {
        throw new Error(
          settings.language === 'en'
            ? 'Please sign in with Google first.'
            : '먼저 Google 계정으로 로그인해 주세요.',
        );
      }
      const res = await registerOrRenameNickname({
        playerId: authUser.uid,
        ownerUid: authUser.uid,
        nextNickname,
        lang: settings.language,
      });
      setNickname(res.nickname);
      setNeedsNicknameSetup(false);
      setNicknameModalDismissed(false);
      saveLocalBestFlips(res.bestFlips, authUser.uid);
      setBestFlips(res.bestFlips);
    },
    [authUser, isSignedIn, settings.language],
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

  const handleUploadBackground = useCallback(
    async (file: File) => {
      const nextUrl = await processAndSaveBackgroundImage(file);
      if (customBgUrlRef.current) {
        URL.revokeObjectURL(customBgUrlRef.current);
      }
      setCustomBgUrl(nextUrl);
      updateSettings({ hasCustomBackground: true });
    },
    [updateSettings],
  );

  const handleRemoveBackground = useCallback(async () => {
    await clearBackgroundImage();
    if (customBgUrlRef.current) {
      URL.revokeObjectURL(customBgUrlRef.current);
    }
    setCustomBgUrl(null);
    updateSettings({ hasCustomBackground: false });
  }, [updateSettings]);

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
        setAiFlips((prev) => {
          const next = prev + 1;
          aiFlipsRef.current = next;
          return next;
        });
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
    setFocusDimmed(false);
    setTimeLeft(0);
    setTimeProgress(0);

    const actualElapsedSec = Math.max(0, (performance.now() - startTimeRef.current) / 1000);
    const matchDurationSec = durationSecRef.current;
    const isStandard60s = matchDurationSec === 60;
    const elapsedSec = matchDurationSec;
    const finalCpm = Math.round((correctCharsRef.current / elapsedSec) * 60);
    const finalRawCpm = Math.round((rawCharsRef.current / elapsedSec) * 60);
    const accuracy =
      rawCharsRef.current > 0
        ? Math.min(100, Math.round((correctCharsRef.current / rawCharsRef.current) * 1000) / 10)
        : 100;
    const currentFlips = flipsRef.current;
    const currentAiFlips = aiFlipsRef.current;
    const avgSecPerWord =
      currentFlips > 0 ? Math.round((elapsedSec / currentFlips) * 100) / 100 : 0;

    const segmentSec = Math.max(1, matchDurationSec / 6);
    const paceBuckets: PaceBucket[] = bucketCharsRef.current.map((chars, idx) => ({
      label: `${Math.round((idx + 1) * segmentSec)}s`,
      cpm: Math.round((chars / segmentSec) * 60),
      flips: bucketFlipsRef.current[idx] || 0,
    }));

    const weakWords: WeakWordStat[] = Object.entries(wordStatsMapRef.current)
      .map(([word, st]) => ({
        word,
        mistakes: st.mistakes,
        avgMs: st.count > 0 ? Math.round(st.totalMs / st.count) : 0,
      }))
      .filter((item) => item.mistakes > 0 || item.avgMs >= 1300)
      .sort((a, b) => {
        if (b.mistakes !== a.mistakes) return b.mistakes - a.mistakes;
        return b.avgMs - a.avgMs;
      })
      .slice(0, 4);

    const integrity = evaluateMatchIntegrity(antiCheatRef.current, {
      flips: currentFlips,
      cpm: finalCpm,
      elapsedSec: actualElapsedSec,
      expectedDurationSec: matchDurationSec,
      lang: settings.language,
    });
    const telemetry = getAntiCheatTelemetry(antiCheatRef.current);
    const requiresAdminApproval =
      isStandard60s && integrity.verified && currentFlips >= APPROVAL_THRESHOLD_FLIPS;

    setMetricsSnapshot({
      timeLeft: 0,
      cpm: finalCpm,
      rawCpm: finalRawCpm,
    });

    setMatchReport({
      flips: currentFlips,
      aiFlips: currentAiFlips,
      aiSpeed: aiSpeedRef.current,
      durationSec: matchDurationSec,
      cpm: finalCpm,
      rawCpm: finalRawCpm,
      accuracy,
      avgSecPerWord,
      paceBuckets,
      weakWords,
      verified: integrity.verified,
      pendingApproval: requiresAdminApproval,
      cheatReason: integrity.reason,
    });

    // Leaderboard registration, rank updates & moderation reports apply strictly to 60s games
    if (!isStandard60s) {
      return;
    }

    // Guests keep local match history and local personal best only (no cloud writes)
    if (!isSignedIn || !authUser) {
      if (integrity.verified) {
        const nextGuestBest = Math.max(bestFlipsRef.current, currentFlips);
        saveLocalBestFlips(nextGuestBest, guestPlayerId);
        setBestFlips(nextGuestBest);
        void recordVerifiedMatch({
          playerId: guestPlayerId,
          flips: currentFlips,
          aiFlips: currentAiFlips,
          aiSpeed: aiSpeedRef.current,
          cpm: finalCpm,
          rawCpm: finalRawCpm,
          accuracy,
          syncToCloud: false,
        }).catch(() => {});
      }
      return;
    }

    const signedUid = authUser.uid;

    if (!integrity.verified) {
      void submitModerationReport({
        playerId: signedUid,
        nickname: nicknameRef.current || authUser.displayName || 'Unregistered',
        category: 'suspicious',
        reason: integrity.reason || '비정상적인 입력 패턴 감지',
        flips: currentFlips,
        aiFlips: currentAiFlips,
        aiSpeed: aiSpeedRef.current,
        cpm: finalCpm,
        rawCpm: finalRawCpm,
        accuracy,
        elapsedSec: actualElapsedSec,
        untrustedCount: telemetry.untrustedCount,
        bulkInjectionCount: telemetry.bulkInjectionCount,
        pasteBlockedCount: telemetry.pasteBlockedCount,
        interKeyMeanMs: telemetry.interKeyMeanMs,
        interKeyStdDevMs: telemetry.interKeyStdDevMs,
        paceCpms: paceBuckets.map((b) => b.cpm),
      }).catch(() => {});
      return;
    }

    if (requiresAdminApproval) {
      void submitModerationReport({
        playerId: signedUid,
        nickname: nicknameRef.current || authUser.displayName || 'Unregistered',
        category: 'high_score',
        reason: `${APPROVAL_THRESHOLD_FLIPS}판 이상 고득점 관리자 승인 대기`,
        flips: currentFlips,
        aiFlips: currentAiFlips,
        aiSpeed: aiSpeedRef.current,
        cpm: finalCpm,
        rawCpm: finalRawCpm,
        accuracy,
        elapsedSec: actualElapsedSec,
        untrustedCount: telemetry.untrustedCount,
        bulkInjectionCount: telemetry.bulkInjectionCount,
        pasteBlockedCount: telemetry.pasteBlockedCount,
        interKeyMeanMs: telemetry.interKeyMeanMs,
        interKeyStdDevMs: telemetry.interKeyStdDevMs,
        paceCpms: paceBuckets.map((b) => b.cpm),
      }).catch(() => {});
      return;
    }

    if (nicknameRef.current) {
      void syncPersonalBestToLeaderboard({
        playerId: signedUid,
        ownerUid: signedUid,
        nickname: nicknameRef.current,
        matchFlips: currentFlips,
        cpm: finalCpm,
        accuracy,
      })
        .then(({ serverBestFlips }) => {
          saveLocalBestFlips(serverBestFlips, signedUid);
          setBestFlips(serverBestFlips);
        })
        .catch(() => {});
    } else {
      const nextBest = Math.max(bestFlipsRef.current, currentFlips);
      saveLocalBestFlips(nextBest, signedUid);
      setBestFlips(nextBest);
    }

    void recordVerifiedMatch({
      playerId: signedUid,
      flips: currentFlips,
      aiFlips: currentAiFlips,
      aiSpeed: aiSpeedRef.current,
      cpm: finalCpm,
      rawCpm: finalRawCpm,
      accuracy,
      syncToCloud: true,
    }).catch(() => {});
  }, [authUser, clearTimers, guestPlayerId, isSignedIn, settings.language]);

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

  const resetMatchTelemetry = useCallback(() => {
    correctCharsRef.current = 0;
    rawCharsRef.current = 0;
    wordAttemptStartRef.current = null;
    bucketCharsRef.current = [0, 0, 0, 0, 0, 0];
    bucketFlipsRef.current = [0, 0, 0, 0, 0, 0];
    wordStatsMapRef.current = {};
    antiCheatRef.current = createAntiCheatState();
    setMatchReport(null);
    setPasteNotice(false);
    setFocusDimmed(false);
  }, []);

  const beginActivePlay = useCallback(() => {
    clearTimers();
    const freshTiles = createInitialTiles(swapSidesRef.current);
    tilesRef.current = freshTiles;
    setTiles(freshTiles);

    const matchDurationMs = durationSecRef.current * 1000;
    const now = performance.now();
    startTimeRef.current = now;
    endTimeRef.current = now + matchDurationMs;

    statusRef.current = 'PLAYING';
    setStatus('PLAYING');

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    scheduleAI();

    const tick = () => {
      if (statusRef.current !== 'PLAYING') return;
      const remainingMs = Math.max(0, endTimeRef.current - performance.now());
      const progress = remainingMs / matchDurationMs;
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
    resetMatchTelemetry();
    const matchDurationSec = durationSecRef.current;
    const blankResetTiles = createInitialTiles(swapSidesRef.current);
    tilesRef.current = blankResetTiles;
    setTiles(blankResetTiles);
    setFlips(0);
    flipsRef.current = 0;
    setAiFlips(0);
    aiFlipsRef.current = 0;
    setTimeLeft(matchDurationSec);
    setTimeProgress(1);
    setInputValue('');
    setActiveFlipIds({});
    setMetricsSnapshot({
      timeLeft: matchDurationSec,
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
  }, [beginActivePlay, clearTimers, resetMatchTelemetry]);

  const resetToIdle = useCallback(() => {
    clearTimers();
    resetMatchTelemetry();
    const matchDurationSec = durationSecRef.current;
    const initialTiles = createInitialTiles(swapSidesRef.current);
    tilesRef.current = initialTiles;
    setTiles(initialTiles);
    setFlips(0);
    flipsRef.current = 0;
    setAiFlips(0);
    aiFlipsRef.current = 0;
    setTimeLeft(matchDurationSec);
    setTimeProgress(1);
    setInputValue('');
    setActiveFlipIds({});
    setMetricsSnapshot({
      timeLeft: matchDurationSec,
      cpm: 0,
      rawCpm: 0,
    });
    statusRef.current = 'IDLE';
    setStatus('IDLE');
  }, [clearTimers, resetMatchTelemetry]);

  const handleSelectDuration = useCallback((nextSeconds: number) => {
    if (statusRef.current !== 'IDLE') return;
    durationSecRef.current = nextSeconds;
    setDurationSec(nextSeconds);
    setTimeLeft(nextSeconds);
    setTimeProgress(1);
    setMetricsSnapshot((prev) => ({
      ...prev,
      timeLeft: nextSeconds,
    }));
    if (nextSeconds !== 60) {
      setRanksOpen(false);
    }
  }, []);

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
      if (pasteTimeoutRef.current !== null) {
        window.clearTimeout(pasteTimeoutRef.current);
      }
      Object.values(flipTimeoutsRef.current).forEach((t) => window.clearTimeout(t));
    };
  }, [clearTimers]);

  const showBlockedInputHint = useCallback(() => {
    setPasteNotice(true);
    if (pasteTimeoutRef.current !== null) {
      window.clearTimeout(pasteTimeoutRef.current);
    }
    pasteTimeoutRef.current = window.setTimeout(() => {
      setPasteNotice(false);
    }, 2200);
  }, []);

  const submitWord = useCallback(() => {
    if (statusRef.current !== 'PLAYING') return;
    const trimmed = inputValue.trim().toLowerCase();
    setInputValue('');
    const attemptStart = wordAttemptStartRef.current;
    wordAttemptStartRef.current = null;

    if (!trimmed) return;

    const match = tilesRef.current.find(
      (t) => t.owner === 'ai' && t.word.toLowerCase() === trimmed,
    );

    if (!match) {
      const targetWord = findClosestAiWord(trimmed, tilesRef.current);
      const existingStat = wordStatsMapRef.current[targetWord] ?? {
        mistakes: 0,
        totalMs: 0,
        count: 0,
      };
      wordStatsMapRef.current[targetWord] = {
        ...existingStat,
        mistakes: existingStat.mistakes + 1,
      };

      setShakingInput(true);
      window.setTimeout(() => setShakingInput(false), 190);
      if (settings.sfxEnabled && settings.sfxTyping) {
        playTypeSound(settings.sfxVolume);
      }
      return;
    }

    const now = performance.now();
    const elapsedSec = Math.max(0, (now - startTimeRef.current) / 1000);
    const segmentSec = Math.max(1, durationSecRef.current / 6);
    const bucketIdx = Math.min(5, Math.floor(elapsedSec / segmentSec));
    const charDelta = match.word.length + 1;

    correctCharsRef.current += charDelta;
    bucketCharsRef.current[bucketIdx] += charDelta;
    bucketFlipsRef.current[bucketIdx] += 1;

    const wordDurationMs = attemptStart !== null ? Math.max(0, now - attemptStart) : 0;
    const prevWordStat = wordStatsMapRef.current[match.word] ?? {
      mistakes: 0,
      totalMs: 0,
      count: 0,
    };
    wordStatsMapRef.current[match.word] = {
      mistakes: prevWordStat.mistakes,
      totalMs: prevWordStat.totalMs + wordDurationMs,
      count: prevWordStat.count + 1,
    };

    if (settings.sfxEnabled && settings.sfxFlip) {
      playFlipSound(settings.sfxVolume);
    }
    flipTile(match.id, 'user');
  }, [
    flipTile,
    inputValue,
    settings.sfxEnabled,
    settings.sfxFlip,
    settings.sfxTyping,
    settings.sfxVolume,
  ]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setFocusDimmed(false);
      return;
    }

    if (statusRef.current !== 'PLAYING') {
      return;
    }

    if (!e.nativeEvent.isTrusted) {
      antiCheatRef.current.untrustedCount += 1;
    }

    if (settings.focusMode && status === 'PLAYING') {
      setFocusDimmed(true);
    }

    if (e.key === ' ' || e.code === 'Space') {
      if (inputValue.length === 0) {
        if (settings.preventEmptySpace) {
          e.preventDefault();
          return;
        }
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

    const deltaChars = next.length - inputValue.length;
    const isComposing = Boolean((e.nativeEvent as InputEvent).isComposing);
    recordKeyInputSample(antiCheatRef.current, {
      isTrusted: e.nativeEvent.isTrusted,
      deltaChars,
      isComposing,
      nowMs: performance.now(),
    });

    if (settings.focusMode && status === 'PLAYING') {
      setFocusDimmed(true);
    }

    if (inputValue.length === 0 && next.length > 0 && wordAttemptStartRef.current === null) {
      wordAttemptStartRef.current = performance.now();
    } else if (next.length === 0) {
      wordAttemptStartRef.current = null;
    }

    if (deltaChars > 0) {
      rawCharsRef.current += deltaChars;
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

  const isUiDimmed = settings.focusMode && focusDimmed && status === 'PLAYING';
  const canAccessAdmin = isAdminUser(authUser);
  const safeHeaderAvatar =
    isSignedIn && authUser?.photoURL && authUser.photoURL.startsWith('https://')
      ? authUser.photoURL
      : null;

  if (adminViewOpen && canAccessAdmin) {
    return (
      <AdminConsole
        nickname={nickname}
        authUser={authUser}
        lang={lang}
        theme={theme}
        onExit={() => setAdminViewOpen(false)}
      />
    );
  }

  return (
    <div
      onMouseMove={() => {
        if (focusDimmed) setFocusDimmed(false);
      }}
      className="relative min-h-screen w-full flex flex-col justify-between transition-colors duration-200 overflow-x-hidden"
      style={{
        backgroundColor: customBgUrl ? 'transparent' : theme.bg,
        color: theme.text,
      }}
    >
      {/* Custom Uploaded Background Photo + Blur & Theme-Safe Scrim */}
      {customBgUrl && (
        <div
          className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
          style={{ backgroundColor: theme.bg }}
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 bg-cover bg-center transition-[filter] duration-200"
            style={{
              backgroundImage: `url(${customBgUrl})`,
              filter: `blur(${settings.backgroundBlur}px)`,
              transform: 'scale(1.06)',
            }}
          />
          <div
            className="absolute inset-0 transition-opacity duration-200"
            style={{
              backgroundColor: theme.bg,
              opacity: settings.backgroundDim / 100,
            }}
          />
        </div>
      )}

      {/* Top Progress Bar */}
      <TimeBar visible={settings.showTimeBar} progress={timeProgress} theme={theme} />

      <div className="relative z-10 w-full max-w-[1320px] mx-auto px-4 sm:px-8 pt-6 pb-8 flex-1 flex flex-col justify-between">
        {/* Top Bar */}
        <header className="relative z-30 flex items-start justify-between gap-4">
          <div className="flex flex-col items-start">
            <span
              className={`text-xl sm:text-2xl font-bold tracking-tight whitespace-nowrap select-none transition-opacity duration-200 ${
                isUiDimmed ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
            >
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

          <div
            className={`flex flex-wrap items-center justify-end gap-2 transition-opacity duration-200 ${
              isUiDimmed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
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
                <span>{t.reset}</span>
              </button>
            )}

            {/* Quick Language Toggle (KO / EN) */}
            <button
              type="button"
              onClick={() => updateSettings({ language: lang === 'ko' ? 'en' : 'ko' })}
              aria-label={t.languageToggleTitle}
              title={t.languageToggleTitle}
              className="h-10 px-3 rounded-lg font-mono-typing text-xs font-semibold tracking-wide flex items-center justify-center transition-opacity hover:opacity-85 cursor-pointer whitespace-nowrap shrink-0"
              style={{
                backgroundColor: theme.surface,
                color: theme.muted,
              }}
            >
              {lang === 'ko' ? 'KO' : 'EN'}
            </button>

            {/* Google Sign-In or Account Profile Pill Button */}
            {!isSignedIn ? (
              <button
                type="button"
                disabled={authBusy}
                onClick={handleSignInGoogle}
                title={t.googleSignInTitle}
                className="h-10 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: theme.accent,
                  color: theme.accentText,
                }}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{authBusy ? t.googleLoggingIn : t.googleLogin}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                aria-label={t.profileAndStats}
                title={nickname || authUser?.email || t.profileAndStats}
                className="h-10 pl-1.5 pr-3 rounded-lg flex items-center gap-2 transition-opacity hover:opacity-85 cursor-pointer shrink-0 max-w-[170px]"
                style={{
                  backgroundColor: theme.surface,
                  color: theme.text,
                }}
              >
                <span
                  className="w-7 h-7 rounded-md overflow-hidden flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: theme.accent,
                    color: theme.accentText,
                  }}
                >
                  {safeHeaderAvatar && !headerAvatarError ? (
                    <img
                      src={safeHeaderAvatar}
                      alt={authUser?.displayName || 'Profile'}
                      referrerPolicy="no-referrer"
                      onError={() => setHeaderAvatarError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-3.5 h-3.5" />
                  )}
                </span>
                <span className="text-xs font-medium truncate">
                  {nickname || authUser?.displayName || t.guestLabel}
                </span>
              </button>
            )}

            {canAccessAdmin && (
              <button
                type="button"
                onClick={() => {
                  if (status === 'PLAYING' || status === 'COUNTDOWN') {
                    resetToIdle();
                  }
                  setAdminViewOpen(true);
                }}
                aria-label={t.adminConsole}
                title={t.adminConsoleTitle}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-opacity hover:opacity-85 cursor-pointer shrink-0"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  color: theme.accent,
                }}
              >
                <Shield className="w-4 h-4" />
              </button>
            )}

            {!isSignedIn && (
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                aria-label={t.profileAndStats}
                title={t.profileAndStats}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-opacity hover:opacity-85 cursor-pointer shrink-0"
                style={{
                  backgroundColor: theme.surface,
                  color: theme.text,
                }}
              >
                <User className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setLeaderboardOpen(true)}
              aria-label={t.leaderboard}
              title={t.leaderboard}
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

            {durationSec === 60 && (
              <button
                type="button"
                onClick={() => setRanksOpen(true)}
                aria-label={t.ranks}
                title={t.ranks}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-opacity hover:opacity-85 cursor-pointer shrink-0"
                style={{
                  backgroundColor: theme.userTile,
                  color: theme.userTileText,
                }}
              >
                <Trophy className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setSettingsInitialTab('design');
                setSettingsOpen(true);
              }}
              aria-label={t.settings}
              title={t.settings}
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

        {authError && (
          <div
            role="alert"
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] rounded-xl px-4 py-2.5 text-xs shadow-2xl flex items-center gap-3"
            style={{
              backgroundColor: theme.surfaceElevated,
              color: theme.aiTile,
            }}
          >
            <span className="font-medium leading-snug">{authError}</span>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="font-semibold underline underline-offset-2 cursor-pointer shrink-0 whitespace-nowrap"
              style={{ color: theme.text }}
            >
              {t.dismiss}
            </button>
          </div>
        )}

        {/* Main Game Area */}
        <main className="my-auto py-4 sm:py-6 flex flex-col items-center">
          {/* Speed (left) & Duration (right) Compact Controls above HUD */}
          <MatchModeBar
            aiSpeed={aiSpeed}
            durationSec={durationSec}
            disabled={status !== 'IDLE'}
            dimmed={isUiDimmed}
            lang={lang}
            theme={theme}
            onSelectSpeed={setAiSpeed}
            onSelectDuration={handleSelectDuration}
          />

          {/* HUD Strip */}
          {(!settings.hideScores || !settings.hideTimer) && (
            <section
              className="w-full max-w-[780px] grid grid-cols-3 items-end gap-4 mb-5 sm:mb-7"
              aria-label={t.hudAria}
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
                      <span>{t.myScore}</span>
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
                      {t.timeLeft}
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
                      <span>{t.botScore}</span>
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
            aria-label={t.boardAria}
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
            <div
              className={`w-full mt-2.5 flex items-center gap-2 transition-opacity duration-200 ${
                isUiDimmed ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
            >
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

          {/* Theme-Harmonious Input Bar (click while IDLE to begin game) */}
          <div className="w-full max-w-[520px] mt-5 sm:mt-6">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onClick={() => {
                if (status === 'IDLE') {
                  startGame();
                }
              }}
              onPaste={(e) => {
                e.preventDefault();
                antiCheatRef.current.pasteBlockedCount += 1;
                showBlockedInputHint();
              }}
              onDrop={(e) => {
                e.preventDefault();
                antiCheatRef.current.pasteBlockedCount += 1;
                showBlockedInputHint();
              }}
              readOnly={status === 'IDLE'}
              disabled={status === 'COUNTDOWN' || status === 'FINISHED'}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={
                status === 'PLAYING'
                  ? t.placeholderPlaying
                  : status === 'COUNTDOWN'
                    ? t.placeholderCountdown(countdownLeft)
                    : t.placeholderIdle
              }
              aria-label={t.inputAria}
              className={`w-full rounded-xl px-5 py-3.5 text-center font-mono-typing text-lg sm:text-xl font-medium outline-none transition-all duration-150 disabled:opacity-45 ${
                status === 'IDLE' ? 'cursor-pointer hover:brightness-105' : ''
              } ${shakingInput ? 'animate-input-shake' : ''}`}
              style={{
                backgroundColor: theme.surface,
                boxShadow:
                  status === 'PLAYING' || status === 'IDLE'
                    ? `0 0 0 2px ${theme.accent}`
                    : 'none',
                color: theme.text,
                caretColor: status === 'PLAYING' ? theme.accent : 'transparent',
              }}
            />
            <div
              className={`text-center text-xs mt-2.5 transition-opacity duration-200 ${
                pasteNotice
                  ? 'opacity-100'
                  : isUiDimmed
                    ? 'opacity-0 pointer-events-none'
                    : 'opacity-100'
              }`}
              style={{ color: pasteNotice ? theme.aiTile : theme.muted }}
            >
              {pasteNotice
                ? t.pasteBlocked
                : status === 'IDLE'
                  ? t.idleHint
                  : t.playingHint}
            </div>
          </div>
        </main>

        {/* Quiet Minimal Footer */}
        <footer
          className={`text-center text-xs pt-2 select-none transition-opacity duration-200 ${
            isUiDimmed ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          style={{ color: theme.muted }}
        >
          {t.footerMode(durationSec, aiSpeed, themeDisplay.name)}
        </footer>
      </div>

      {/* Match Result Modal */}
      <ResultModal
        open={status === 'FINISHED'}
        report={matchReport}
        isSignedIn={isSignedIn}
        hasNickname={Boolean(nickname)}
        authBusy={authBusy}
        lang={lang}
        theme={theme}
        onSignInGoogle={handleSignInGoogle}
        onOpenNicknameSetup={() => {
          setNicknameModalDismissed(false);
          setNeedsNicknameSetup(true);
        }}
        onRestart={resetToIdle}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        initialTab={settingsInitialTab}
        settings={settings}
        nickname={nickname}
        authUser={authUser}
        authBusy={authBusy}
        customBgUrl={customBgUrl}
        theme={theme}
        onUpdateSettings={updateSettings}
        onUploadBackground={handleUploadBackground}
        onRemoveBackground={handleRemoveBackground}
        onSignInGoogle={handleSignInGoogle}
        onSignOutGoogle={handleSignOutGoogle}
        onChangeNickname={handleRegisterOrRenameNickname}
        onClose={() => {
          setSettingsOpen(false);
          if (status === 'PLAYING') {
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }
        }}
      />

      {/* Profile & Match Summary Modal */}
      <ProfileModal
        open={profileOpen}
        playerId={activePlayerId}
        nickname={nickname}
        authUser={authUser}
        authBusy={authBusy}
        legacyCandidate={
          isSignedIn && (!nickname || bestFlips === 0) ? availableLegacyCandidate : null
        }
        lang={lang}
        theme={theme}
        onSignInGoogle={handleSignInGoogle}
        onSignOutGoogle={handleSignOutGoogle}
        onOpenNicknameSetup={() => {
          setNicknameModalDismissed(false);
          setNeedsNicknameSetup(true);
        }}
        onOpenNicknameEdit={() => {
          setSettingsInitialTab('sound');
          setSettingsOpen(true);
        }}
        onOpenLegacyClaim={() => {
          if (authUser && availableLegacyCandidate) {
            clearLegacyClaimDismissed(authUser.uid, availableLegacyCandidate.legacyPlayerId);
            setPendingLegacyClaim(availableLegacyCandidate);
          }
        }}
        onClose={() => {
          setProfileOpen(false);
          if (status === 'PLAYING') {
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }
        }}
      />

      {/* Rank System Modal */}
      <RankModal
        open={ranksOpen}
        bestFlips={bestFlips}
        lang={lang}
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
        playerId={activePlayerId}
        nickname={nickname}
        isSignedIn={isSignedIn}
        authBusy={authBusy}
        lang={lang}
        theme={theme}
        onSignInGoogle={handleSignInGoogle}
        onClose={() => {
          setLeaderboardOpen(false);
          if (status === 'PLAYING') {
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }
        }}
      />

      {/* Legacy / Guest Record Claim Modal */}
      <LegacyClaimModal
        candidate={isSignedIn && (!nickname || bestFlips === 0) ? pendingLegacyClaim : null}
        existingNickname={nickname || undefined}
        defaultNickname={isAdminUser(authUser) ? 'Semistry' : undefined}
        lang={lang}
        theme={theme}
        onClaim={handleClaimLegacyRecord}
        onStartFresh={handleStartFreshFromLegacy}
      />

      {/* Signed-in First-Time Leaderboard Nickname Setup Modal (Guests play freely without it) */}
      <NicknameModal
        open={
          isSignedIn &&
          needsNicknameSetup &&
          !pendingLegacyClaim &&
          !nickname &&
          !nicknameModalDismissed
        }
        initialNickname={isAdminUser(authUser) ? 'Semistry' : ''}
        lang={lang}
        theme={theme}
        onSubmit={handleRegisterOrRenameNickname}
        onDismiss={() => setNicknameModalDismissed(true)}
      />
    </div>
  );
}
