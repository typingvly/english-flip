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

export interface GameSettings {
  themeId: ThemeId;
  customTheme: CustomThemeColors;
  fontId: FontId;
  swapSides: boolean;
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
