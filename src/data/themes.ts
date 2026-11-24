import { CustomThemeColors, ThemeConfig, ThemeId } from '../types/game';

export type PresetThemeId = Exclude<ThemeId, 'custom'>;

export const DEFAULT_CUSTOM_THEME: CustomThemeColors = {
  bg: '#161a24',
  text: '#edf2ff',
  userTile: '#38d9a9',
  aiTile: '#ff6b8b',
  accent: '#38d9a9',
};

function normalizeHex(hex: string, fallback: string): string {
  const cleaned = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
    return cleaned.toLowerCase();
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const val = parseInt(hex.slice(1), 16);
  return [(val >> 16) & 255, (val >> 8) & 255, val & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  );
}

function mixHex(hexA: string, hexB: string, weightB: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const wA = 1 - weightB;
  return rgbToHex(r1 * wA + r2 * weightB, g1 * wA + g2 * weightB, b1 * wA + b2 * weightB);
}

function getRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getBestContrastText(bgHex: string): string {
  const bgLum = getRelativeLuminance(bgHex);
  const darkHex = '#14161b';
  const lightHex = '#ffffff';
  const darkLum = getRelativeLuminance(darkHex);
  const lightLum = 1;
  const darkRatio = (Math.max(bgLum, darkLum) + 0.05) / (Math.min(bgLum, darkLum) + 0.05);
  const lightRatio = (Math.max(bgLum, lightLum) + 0.05) / (Math.min(bgLum, lightLum) + 0.05);
  return darkRatio >= lightRatio ? darkHex : lightHex;
}

export function sanitizeCustomTheme(raw?: Partial<CustomThemeColors>): CustomThemeColors {
  return {
    bg: normalizeHex(raw?.bg ?? '', DEFAULT_CUSTOM_THEME.bg),
    text: normalizeHex(raw?.text ?? '', DEFAULT_CUSTOM_THEME.text),
    userTile: normalizeHex(raw?.userTile ?? '', DEFAULT_CUSTOM_THEME.userTile),
    aiTile: normalizeHex(raw?.aiTile ?? '', DEFAULT_CUSTOM_THEME.aiTile),
    accent: normalizeHex(raw?.accent ?? '', DEFAULT_CUSTOM_THEME.accent),
  };
}

export function buildCustomTheme(colors: CustomThemeColors): ThemeConfig {
  const safe = sanitizeCustomTheme(colors);
  const bgLum = getRelativeLuminance(safe.bg);
  const isDark = bgLum < 0.25;

  const surface = isDark ? mixHex(safe.bg, '#ffffff', 0.07) : mixHex(safe.bg, '#000000', 0.08);
  const surfaceElevated = isDark
    ? mixHex(safe.bg, '#ffffff', 0.14)
    : bgLum > 0.85
      ? '#ffffff'
      : mixHex(safe.bg, '#ffffff', 0.55);
  const border = isDark ? mixHex(safe.bg, '#ffffff', 0.22) : mixHex(safe.bg, '#000000', 0.18);
  const muted = mixHex(safe.text, safe.bg, 0.42);

  return {
    id: 'custom',
    name: '사용자 설정',
    subtitle: '직접 색상 지정',
    isDark,
    bg: safe.bg,
    surface,
    surfaceElevated,
    border,
    text: safe.text,
    muted,
    userTile: safe.userTile,
    userTileText: getBestContrastText(safe.userTile),
    aiTile: safe.aiTile,
    aiTileText: getBestContrastText(safe.aiTile),
    accent: safe.accent,
    accentText: getBestContrastText(safe.accent),
    barColors: [
      safe.userTile,
      mixHex(safe.userTile, isDark ? '#ffffff' : safe.bg, 0.28),
      mixHex(safe.aiTile, isDark ? '#ffffff' : safe.bg, 0.28),
      safe.aiTile,
    ],
  };
}

export const THEMES: Record<PresetThemeId, ThemeConfig> = {
  classic: {
    id: 'classic',
    name: 'Red & Blue',
    subtitle: '기본 대비',
    isDark: true,
    bg: '#16181e',
    surface: '#1d2028',
    surfaceElevated: '#242832',
    border: '#2c313d',
    text: '#e4e8f0',
    muted: '#737b8c',
    userTile: '#68a4f7',
    userTileText: '#16181e',
    aiTile: '#ef6f77',
    aiTileText: '#16181e',
    accent: '#68a4f7',
    accentText: '#16181e',
    barColors: ['#68a4f7', '#94bdf9', '#f49ca1', '#ef6f77'],
  },
  'serika-dark': {
    id: 'serika-dark',
    name: 'Serika Dark',
    subtitle: '골드 & 슬레이트',
    isDark: true,
    bg: '#323437',
    surface: '#2c2e31',
    surfaceElevated: '#383a3e',
    border: '#44474c',
    text: '#d1d0c5',
    muted: '#76787c',
    userTile: '#e2b714',
    userTileText: '#26282a',
    aiTile: '#8f96a0',
    aiTileText: '#222426',
    accent: '#e2b714',
    accentText: '#26282a',
    barColors: ['#e2b714', '#caa62c', '#9da3ac', '#d1d0c5'],
  },
  nord: {
    id: 'nord',
    name: 'Nord',
    subtitle: '프로스트 & 코랄',
    isDark: true,
    bg: '#242933',
    surface: '#2b303c',
    surfaceElevated: '#323846',
    border: '#3e4656',
    text: '#eceff4',
    muted: '#7e8ba3',
    userTile: '#88c0d0',
    userTileText: '#242933',
    aiTile: '#d08770',
    aiTileText: '#242933',
    accent: '#88c0d0',
    accentText: '#242933',
    barColors: ['#88c0d0', '#81a1c1', '#ebcb8b', '#d08770'],
  },
  matcha: {
    id: 'matcha',
    name: 'Matcha',
    subtitle: '말차 & 테라코타',
    isDark: false,
    bg: '#f4f2ea',
    surface: '#e3dfd0',
    surfaceElevated: '#ffffff',
    border: '#cbc5b2',
    text: '#1b221c',
    muted: '#5c6459',
    userTile: '#2d6e49',
    userTileText: '#ffffff',
    aiTile: '#c44636',
    aiTileText: '#ffffff',
    accent: '#2d6e49',
    accentText: '#ffffff',
    barColors: ['#2d6e49', '#5a946f', '#d97a6c', '#c44636'],
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    subtitle: '클린 라이트',
    isDark: false,
    bg: '#f5f6f8',
    surface: '#ebedf2',
    surfaceElevated: '#ffffff',
    border: '#d7dce5',
    text: '#1c2129',
    muted: '#788192',
    userTile: '#2d62c6',
    userTileText: '#f5f6f8',
    aiTile: '#c4404d',
    aiTileText: '#f5f6f8',
    accent: '#2d62c6',
    accentText: '#f5f6f8',
    barColors: ['#2d62c6', '#618ad6', '#d16d77', '#c4404d'],
  },
  olive: {
    id: 'olive',
    name: 'Olive & Sand',
    subtitle: '올리브 & 코랄샌드',
    isDark: true,
    bg: '#151812',
    surface: '#20251c',
    surfaceElevated: '#2a3025',
    border: '#3a4233',
    text: '#eff0e6',
    muted: '#949b87',
    userTile: '#9ec95b',
    userTileText: '#12150e',
    aiTile: '#e38756',
    aiTileText: '#16110d',
    accent: '#9ec95b',
    accentText: '#12150e',
    barColors: ['#9ec95b', '#bddb88', '#eab188', '#e38756'],
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    subtitle: '페리윙클 & 로즈',
    isDark: true,
    bg: '#181a26',
    surface: '#1f2232',
    surfaceElevated: '#262a3d',
    border: '#31364e',
    text: '#cfd6f0',
    muted: '#6f7799',
    userTile: '#7aa2f7',
    userTileText: '#181a26',
    aiTile: '#f47990',
    aiTileText: '#181a26',
    accent: '#7aa2f7',
    accentText: '#181a26',
    barColors: ['#7aa2f7', '#7dcfff', '#bb9af7', '#f47990'],
  },
  espresso: {
    id: 'espresso',
    name: 'Espresso',
    subtitle: '크레마 & 베리',
    isDark: true,
    bg: '#14100e',
    surface: '#201916',
    surfaceElevated: '#2b221e',
    border: '#3d302a',
    text: '#f5ece4',
    muted: '#a39186',
    userTile: '#e5b882',
    userTileText: '#17110c',
    aiTile: '#e37466',
    aiTileText: '#160e0c',
    accent: '#e5b882',
    accentText: '#17110c',
    barColors: ['#e5b882', '#edd0ab', '#e5998c', '#e37466'],
  },
  'violet-mint': {
    id: 'violet-mint',
    name: 'Violet & Mint',
    subtitle: '플럼 & 민트',
    isDark: true,
    bg: '#171421',
    surface: '#211c2e',
    surfaceElevated: '#2b253c',
    border: '#3a3250',
    text: '#eeeaf8',
    muted: '#9489b2',
    userTile: '#56e39f',
    userTileText: '#101c16',
    aiTile: '#f46d9b',
    aiTileText: '#1d0d14',
    accent: '#56e39f',
    accentText: '#101c16',
    barColors: ['#56e39f', '#8eebbd', '#f79ab9', '#f46d9b'],
  },
};

export const PRESET_THEME_LIST: ThemeConfig[] = Object.values(THEMES);

export function isValidThemeId(id: unknown): id is ThemeId {
  return typeof id === 'string' && (id === 'custom' || id in THEMES);
}

export function resolveTheme(themeId: ThemeId, customTheme: CustomThemeColors): ThemeConfig {
  if (themeId === 'custom') {
    return buildCustomTheme(customTheme);
  }
  return THEMES[themeId] ?? THEMES.classic;
}
