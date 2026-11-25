export type ThemeId =
  | 'classic'
  | 'serika-dark'
  | 'nord'
  | 'matcha'
  | 'paper'
  | 'olive'
  | 'midnight'
  | 'espresso'
  | 'violet-mint'
  | 'custom';

export interface CustomThemeColors {
  bg: string;
  text: string;
  userTile: string;
  aiTile: string;
  accent: string;
}

export type FontId =
  | 'jetbrains-mono'
  | 'roboto-mono'
  | 'ibm-plex-mono'
  | 'fira-code'
  | 'plus-jakarta'
  | 'dm-sans';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  subtitle: string;
  isDark: boolean;
  bg: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  muted: string;
  userTile: string;
  userTileText: string;
  aiTile: string;
  aiTileText: string;
  accent: string;
  accentText: string;
  barColors: [string, string, string, string];
}

export type DifficultySpeed = 200 | 400 | 600 | 800;

export type GameStatus = 'IDLE' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED';

export type TeamOwner = 'user' | 'ai';

export interface TileItem {
  id: number;
  word: string;
  owner: TeamOwner;
  flipKey: number;
  lastFlippedBy: TeamOwner | null;
}

export interface PaceBucket {
  label: string;
  cpm: number;
  flips: number;
}

export interface WeakWordStat {
  word: string;
  mistakes: number;
  avgMs: number;
}

export interface MatchReport {
  flips: number;
  aiFlips: number;
  aiSpeed: DifficultySpeed;
  durationSec: number;
  cpm: number;
  rawCpm: number;
  accuracy: number;
  avgSecPerWord: number;
  paceBuckets: PaceBucket[];
  weakWords: WeakWordStat[];
  verified: boolean;
  pendingApproval?: boolean;
  cheatReason: string | null;
}

export type ModerationCategory = 'high_score' | 'suspicious';
export type ModerationStatus = 'pending' | 'approved' | 'rejected';

export interface ModerationReport {
  reportId: string;
  playerId: string;
  nickname: string;
  category: ModerationCategory;
  status: ModerationStatus;
  reason: string;
  flips: number;
  aiFlips: number;
  aiSpeed: DifficultySpeed;
  cpm: number;
  rawCpm: number;
  accuracy: number;
  elapsedSec: number;
  untrustedCount: number;
  bulkInjectionCount: number;
  pasteBlockedCount: number;
  interKeyMeanMs: number;
  interKeyStdDevMs: number;
  paceCpms: number[];
  createdAtMs: number;
  reviewedAtMs?: number;
  adminAction?: string;
}

export interface PlayerControlState {
  playerId: string;
  recordEpoch: number;
  forcedBestFlips: number;
  isRemoved: boolean;
  forcedNickname?: string;
}

export interface PlayerMatchRecord {
  matchId: string;
  playerId: string;
  flips: number;
  aiFlips: number;
  aiSpeed: DifficultySpeed;
  won: boolean;
  cpm: number;
  rawCpm: number;
  accuracy: number;
  rank: string;
  createdAtMs: number;
}

export interface PlayerProfileStats {
  playerId: string;
  totalGames: number;
  wins: number;
  bestFlips: number;
  bestCpm: number;
  totalAccuracySum: number;
  recentMatches: PlayerMatchRecord[];
}

export type AppLanguage = 'ko' | 'en';

export interface GameSettings {
  language: AppLanguage;
  themeId: ThemeId;
  customTheme: CustomThemeColors;
  fontId: FontId;
  swapSides: boolean;
  focusMode: boolean;
  hasCustomBackground: boolean;
  backgroundBlur: number;
  backgroundDim: number;
  sfxEnabled: boolean;
  sfxVolume: number;
  sfxTyping: boolean;
  sfxFlip: boolean;
  preventEmptySpace: boolean;
  showTimeBar: boolean;
  hideScores: boolean;
  hideTimer: boolean;
  showMetricsBar: boolean;
  showMetricsTime: boolean;
  showMetricsCpm: boolean;
  showMetricsRawCpm: boolean;
  metricsInterval: number;
}
