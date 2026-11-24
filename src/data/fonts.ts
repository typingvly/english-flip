import { FontId } from '../types/game';

export interface FontConfig {
  id: FontId;
  name: string;
  category: string;
  family: string;
}

export const FONTS: Record<FontId, FontConfig> = {
  'plus-jakarta': {
    id: 'plus-jakarta',
    name: 'Plus Jakarta Sans',
    category: '산세리프 · 기본',
    family: "'Plus Jakarta Sans', 'Noto Sans KR', system-ui, sans-serif",
  },
  'dm-sans': {
    id: 'dm-sans',
    name: 'DM Sans',
    category: '산세리프 · 미니멀',
    family: "'DM Sans', 'Noto Sans KR', system-ui, sans-serif",
  },
  'ibm-plex-mono': {
    id: 'ibm-plex-mono',
    name: 'IBM Plex Mono',
    category: '고정폭 · 선명함',
    family: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  'fira-code': {
    id: 'fira-code',
    name: 'Fira Code',
    category: '고정폭 · 부드러움',
    family: "'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  'jetbrains-mono': {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    category: '고정폭 · 모던',
    family: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  'roboto-mono': {
    id: 'roboto-mono',
    name: 'Roboto Mono',
    category: '고정폭 · 클래식',
    family: "'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
};

export const FONT_LIST: FontConfig[] = Object.values(FONTS);
