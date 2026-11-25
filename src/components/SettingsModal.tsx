import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { Check, ImagePlus, LogIn, LogOut, RotateCcw, Trash2, Volume2, X } from 'lucide-react';
import { FONT_LIST } from '../data/fonts';
import { buildCustomTheme, DEFAULT_CUSTOM_THEME, PRESET_THEME_LIST } from '../data/themes';
import { COPY, getFontCategoryLabel, getThemeDisplay } from '../i18n/translations';
import { validateNickname } from '../services/leaderboard';
import {
  AppLanguage,
  CustomThemeColors,
  FontId,
  GameSettings,
  ThemeConfig,
  ThemeId,
} from '../types/game';
import { playFlipSound } from '../utils/sound';

export type SettingsTab = 'design' | 'gameplay' | 'sound';

interface SettingsModalProps {
  open: boolean;
  initialTab?: SettingsTab;
  settings: GameSettings;
  nickname: string;
  authUser: FirebaseUser | null;
  authBusy?: boolean;
  customBgUrl: string | null;
  theme: ThemeConfig;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onUploadBackground: (file: File) => Promise<void>;
  onRemoveBackground: () => Promise<void>;
  onSignInGoogle: () => void;
  onSignOutGoogle: () => void;
  onChangeNickname: (nextNickname: string) => Promise<void>;
  onClose: () => void;
}

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  theme: ThemeConfig;
  compact?: boolean;
  disabled?: boolean;
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  theme,
  compact,
  disabled,
  nested,
}: ToggleRowProps & { nested?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center justify-between gap-4 text-left rounded-xl transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed hover:brightness-105 ${
        compact ? 'px-3.5 py-2.5' : 'px-4 py-3.5'
      }`}
      style={{
        backgroundColor: nested ? theme.bg : theme.surface,
      }}
    >
      <div className="min-w-0">
        <div
          className={`${compact ? 'text-[13px]' : 'text-sm'} font-medium`}
          style={{ color: theme.text }}
        >
          {label}
        </div>
        {description && (
          <div className="text-xs mt-0.5 leading-relaxed" style={{ color: theme.muted }}>
            {description}
          </div>
        )}
      </div>

      <span
        className="shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors flex items-center"
        style={{
          backgroundColor: checked ? theme.accent : theme.border,
          justifyContent: checked ? 'flex-end' : 'flex-start',
        }}
      >
        <span
          className="w-5 h-5 rounded-full transition-transform"
          style={{
            backgroundColor: checked ? theme.accentText : theme.surfaceElevated,
          }}
        />
      </span>
    </button>
  );
}

const INTERVAL_PRESETS = [0.3, 0.5, 1.0, 2.0];

export function SettingsModal({
  open,
  initialTab,
  settings,
  nickname,
  authUser,
  authBusy,
  customBgUrl,
  theme,
  onUpdateSettings,
  onUploadBackground,
  onRemoveBackground,
  onSignInGoogle,
  onSignOutGoogle,
  onChangeNickname,
  onClose,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'design');
  const [intervalDraft, setIntervalDraft] = useState<string>(String(settings.metricsInterval));
  const [nicknameDraft, setNicknameDraft] = useState<string>(nickname);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [nicknameSuccess, setNicknameSuccess] = useState<boolean>(false);
  const [nicknameSaving, setNicknameSaving] = useState<boolean>(false);
  const [bgUploading, setBgUploading] = useState<boolean>(false);
  const [bgError, setBgError] = useState<string | null>(null);

  const lang: AppLanguage = settings.language;
  const t = COPY[lang].settings;
  const isSignedIn = Boolean(authUser && authUser.emailVerified);

  const customColorFields: ReadonlyArray<{
    key: keyof CustomThemeColors;
    label: string;
  }> = [
    { key: 'bg', label: t.colorBg },
    { key: 'text', label: t.colorText },
    { key: 'userTile', label: t.colorUserTile },
    { key: 'aiTile', label: t.colorAiTile },
    { key: 'accent', label: t.colorAccent },
  ];

  useEffect(() => {
    if (open) {
      if (initialTab) setTab(initialTab);
      setNicknameDraft(nickname);
      setNicknameError(null);
      setNicknameSuccess(false);
      setBgError(null);
    }
  }, [open, nickname, initialTab]);

  if (!open) return null;

  const handleBackgroundFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || bgUploading) return;

    setBgError(null);
    setBgUploading(true);
    try {
      await onUploadBackground(file);
    } catch (err) {
      setBgError(err instanceof Error ? err.message : t.bgUploadError);
    } finally {
      setBgUploading(false);
    }
  };

  const handleNicknameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (nicknameSaving || !isSignedIn) return;

    const check = validateNickname(nicknameDraft, lang);
    if (!check.valid) {
      setNicknameError(check.error || t.nicknameCheckError);
      setNicknameSuccess(false);
      return;
    }

    if (check.trimmed === nickname) {
      setNicknameError(null);
      setNicknameSuccess(false);
      return;
    }

    setNicknameError(null);
    setNicknameSuccess(false);
    setNicknameSaving(true);
    try {
      await onChangeNickname(check.trimmed);
      setNicknameSuccess(true);
    } catch (err) {
      setNicknameError(err instanceof Error ? err.message : t.nicknameSaveError);
    } finally {
      setNicknameSaving(false);
    }
  };

  const handleIntervalBlur = () => {
    const parsed = parseFloat(intervalDraft);
    const clamped = Number.isFinite(parsed) ? Math.max(0.3, Math.round(parsed * 10) / 10) : 1.0;
    setIntervalDraft(String(clamped));
    onUpdateSettings({ metricsInterval: clamped });
  };

  const handlePresetClick = (val: number) => {
    setIntervalDraft(String(val));
    onUpdateSettings({ metricsInterval: val });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t.dialogAria}
    >
      <div
        className="w-full max-w-[600px] max-h-[86vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl transition-colors"
        style={{
          backgroundColor: theme.surfaceElevated,
          color: theme.text,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 gap-2"
          style={{ backgroundColor: theme.surface }}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setTab('design')}
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              style={{
                backgroundColor: tab === 'design' ? theme.accent : 'transparent',
                color: tab === 'design' ? theme.accentText : theme.muted,
              }}
            >
              {t.tabDesign}
            </button>
            <button
              type="button"
              onClick={() => setTab('gameplay')}
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              style={{
                backgroundColor: tab === 'gameplay' ? theme.accent : 'transparent',
                color: tab === 'gameplay' ? theme.accentText : theme.muted,
              }}
            >
              {t.tabGameplay}
            </button>
            <button
              type="button"
              onClick={() => setTab('sound')}
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              style={{
                backgroundColor: tab === 'sound' ? theme.accent : 'transparent',
                color: tab === 'sound' ? theme.accentText : theme.muted,
              }}
            >
              {t.tabSound}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80 cursor-pointer shrink-0"
            style={{
              backgroundColor: theme.surfaceElevated,
              color: theme.text,
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-7">
          {tab === 'design' && (
            <>
              <div>
                <div className="text-sm font-medium mb-1">{t.themeTitle}</div>
                <p className="text-xs mb-3.5" style={{ color: theme.muted }}>
                  {t.themeDesc}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[...PRESET_THEME_LIST, buildCustomTheme(settings.customTheme)].map((item) => {
                    const active = settings.themeId === item.id;
                    const display = getThemeDisplay(item, lang);
                    const leftBg = settings.swapSides ? item.userTile : item.aiTile;
                    const leftText = settings.swapSides ? item.userTileText : item.aiTileText;
                    const leftLabel = settings.swapSides ? t.me : t.ai;
                    const rightBg = settings.swapSides ? item.aiTile : item.userTile;
                    const rightText = settings.swapSides ? item.aiTileText : item.userTileText;
                    const rightLabel = settings.swapSides ? t.ai : t.me;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onUpdateSettings({ themeId: item.id as ThemeId })}
                        className="text-left rounded-xl p-3.5 transition-transform active:scale-[0.99] cursor-pointer"
                        style={{
                          backgroundColor: item.bg,
                          boxShadow: active ? `0 0 0 2px ${item.accent}` : 'none',
                          color: item.text,
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div>
                            <div className="text-sm font-medium leading-tight">{display.name}</div>
                            <div className="text-[11px] mt-0.5" style={{ color: item.muted }}>
                              {display.subtitle}
                            </div>
                          </div>
                          {active && (
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                              style={{ backgroundColor: item.accent, color: item.accentText }}
                            >
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </div>

                        {/* Mini Board & Timebar Preview */}
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-1.5">
                            <div
                              className="rounded-md py-1.5 text-center font-mono-typing text-xs font-medium"
                              style={{ backgroundColor: leftBg, color: leftText }}
                            >
                              {leftLabel}
                            </div>
                            <div
                              className="rounded-md py-1.5 text-center font-mono-typing text-xs font-medium"
                              style={{ backgroundColor: rightBg, color: rightText }}
                            >
                              {rightLabel}
                            </div>
                          </div>
                          <div className="h-1.5 w-full rounded-full overflow-hidden flex">
                            {item.barColors.map((col, idx) => (
                              <div
                                key={idx}
                                className="flex-1 h-full"
                                style={{ backgroundColor: col }}
                              />
                            ))}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Theme Color Editor */}
                {settings.themeId === 'custom' && (
                  <div
                    className="mt-3 rounded-xl p-4 space-y-3"
                    style={{ backgroundColor: theme.surface }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold" style={{ color: theme.text }}>
                          {t.customEditorTitle}
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: theme.muted }}>
                          {t.customEditorDesc}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({ customTheme: DEFAULT_CUSTOM_THEME })
                        }
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-opacity hover:opacity-80 cursor-pointer shrink-0 whitespace-nowrap"
                        style={{
                          backgroundColor: theme.bg,
                          color: theme.muted,
                        }}
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{t.reset}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {customColorFields.map((field) => {
                        const value = settings.customTheme[field.key];
                        return (
                          <label
                            key={field.key}
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2 cursor-pointer transition-opacity hover:opacity-90"
                            style={{ backgroundColor: theme.bg }}
                          >
                            <span
                              className="w-7 h-7 rounded-lg shrink-0 relative overflow-hidden"
                              style={{ backgroundColor: value }}
                            >
                              <input
                                type="color"
                                value={value}
                                onChange={(e) =>
                                  onUpdateSettings({
                                    customTheme: {
                                      ...settings.customTheme,
                                      [field.key]: e.target.value,
                                    },
                                  })
                                }
                                aria-label={field.label}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              />
                            </span>
                            <div className="min-w-0">
                              <div
                                className="text-xs font-medium leading-tight"
                                style={{ color: theme.text }}
                              >
                                {field.label}
                              </div>
                              <div
                                className="font-mono-typing text-[11px] uppercase mt-0.5"
                                style={{ color: theme.muted }}
                              >
                                {value}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Font Selector */}
              <div>
                <div className="text-sm font-medium mb-1">{t.fontTitle}</div>
                <p className="text-xs mb-3.5" style={{ color: theme.muted }}>
                  {t.fontDesc}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {FONT_LIST.map((font) => {
                    const active = settings.fontId === font.id;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => onUpdateSettings({ fontId: font.id as FontId })}
                        className="text-left rounded-xl px-4 py-3 transition-colors cursor-pointer flex items-center justify-between gap-3"
                        style={{
                          backgroundColor: active ? theme.accent : theme.surface,
                          color: active ? theme.accentText : theme.text,
                        }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{font.name}</span>
                            <span
                              className="text-[11px] shrink-0"
                              style={{
                                color: active ? theme.accentText : theme.muted,
                                opacity: active ? 0.78 : 1,
                              }}
                            >
                              {getFontCategoryLabel(font.id, font.category, lang)}
                            </span>
                          </div>
                          <div
                            className="text-sm mt-1 truncate"
                            style={{
                              fontFamily: font.family,
                              color: active ? theme.accentText : theme.muted,
                              opacity: active ? 0.85 : 1,
                            }}
                          >
                            the quick brown fox
                          </div>
                        </div>

                        {active && (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: theme.accentText, color: theme.accent }}
                          >
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Background Photo Section */}
              <div>
                <div className="text-sm font-medium mb-1">{t.bgPhotoTitle}</div>
                <p className="text-xs mb-3.5" style={{ color: theme.muted }}>
                  {t.bgPhotoDesc}
                </p>

                <div
                  className="rounded-xl p-4 space-y-4"
                  style={{ backgroundColor: theme.surface }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-16 h-11 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: theme.bg }}
                      >
                        {customBgUrl ? (
                          <img
                            src={customBgUrl}
                            alt={t.bgPreviewAlt}
                            className="w-full h-full object-cover"
                            style={{
                              filter: `blur(${Math.round(settings.backgroundBlur / 3)}px)`,
                              transform: 'scale(1.1)',
                            }}
                          />
                        ) : (
                          <ImagePlus className="w-4 h-4" style={{ color: theme.muted }} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="text-xs font-medium" style={{ color: theme.text }}>
                          {customBgUrl ? t.bgActive : t.bgDefault}
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: theme.muted }}>
                          {t.bgMeta}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {customBgUrl && (
                        <button
                          type="button"
                          onClick={() => void onRemoveBackground()}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-85 cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: theme.bg,
                            color: theme.aiTile,
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t.delete}</span>
                        </button>
                      )}

                      <label
                        className="px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer whitespace-nowrap"
                        style={{
                          backgroundColor: theme.accent,
                          color: theme.accentText,
                        }}
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        <span>
                          {bgUploading ? t.uploading : customBgUrl ? t.change : t.upload}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          disabled={bgUploading}
                          onChange={handleBackgroundFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {bgError && (
                    <div className="text-xs" style={{ color: theme.aiTile }}>
                      {bgError}
                    </div>
                  )}

                  {customBgUrl && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div
                        className="rounded-xl px-3.5 py-2.5 space-y-2"
                        style={{ backgroundColor: theme.bg }}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span style={{ color: theme.text }}>{t.bgBlur}</span>
                          <span
                            className="font-mono-typing tabular-nums"
                            style={{ color: theme.muted }}
                          >
                            {settings.backgroundBlur}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={24}
                          step={1}
                          value={settings.backgroundBlur}
                          onChange={(e) =>
                            onUpdateSettings({ backgroundBlur: Number(e.target.value) })
                          }
                          aria-label={t.bgBlur}
                          className="w-full cursor-pointer"
                          style={{ accentColor: theme.accent }}
                        />
                      </div>

                      <div
                        className="rounded-xl px-3.5 py-2.5 space-y-2"
                        style={{ backgroundColor: theme.bg }}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span style={{ color: theme.text }}>{t.bgDim}</span>
                          <span
                            className="font-mono-typing tabular-nums"
                            style={{ color: theme.muted }}
                          >
                            {settings.backgroundDim}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={85}
                          step={5}
                          value={settings.backgroundDim}
                          onChange={(e) =>
                            onUpdateSettings({ backgroundDim: Number(e.target.value) })
                          }
                          aria-label={t.bgDim}
                          className="w-full cursor-pointer"
                          style={{ accentColor: theme.accent }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {tab === 'gameplay' && (
            <div className="space-y-2.5">
              {/* Language Selector (Korean / English only) */}
              <div
                className="rounded-xl px-4 py-3.5 flex flex-wrap items-center justify-between gap-3"
                style={{ backgroundColor: theme.surface }}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium" style={{ color: theme.text }}>
                    {t.languageTitle}
                  </div>
                  <div className="text-xs mt-0.5 leading-relaxed" style={{ color: theme.muted }}>
                    {t.languageDesc}
                  </div>
                </div>

                <div
                  className="inline-flex items-center gap-1 p-1 rounded-lg shrink-0"
                  style={{ backgroundColor: theme.bg }}
                >
                  {(
                    [
                      ['ko', '한국어'],
                      ['en', 'English'],
                    ] as const
                  ).map(([code, label]) => {
                    const active = settings.language === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => onUpdateSettings({ language: code })}
                        className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        style={{
                          backgroundColor: active ? theme.accent : 'transparent',
                          color: active ? theme.accentText : theme.muted,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <ToggleRow
                label={t.focusMode}
                description={t.focusModeDesc}
                checked={settings.focusMode}
                onChange={(val) => onUpdateSettings({ focusMode: val })}
                theme={theme}
              />

              <ToggleRow
                label={t.swapSides}
                description={t.swapSidesDesc}
                checked={settings.swapSides}
                onChange={(val) => onUpdateSettings({ swapSides: val })}
                theme={theme}
              />

              <ToggleRow
                label={t.preventEmptySpace}
                description={t.preventEmptySpaceDesc}
                checked={settings.preventEmptySpace}
                onChange={(val) => onUpdateSettings({ preventEmptySpace: val })}
                theme={theme}
              />

              <ToggleRow
                label={t.showTimeBar}
                description={t.showTimeBarDesc}
                checked={settings.showTimeBar}
                onChange={(val) => onUpdateSettings({ showTimeBar: val })}
                theme={theme}
              />

              <ToggleRow
                label={t.hideScores}
                description={t.hideScoresDesc}
                checked={settings.hideScores}
                onChange={(val) => onUpdateSettings({ hideScores: val })}
                theme={theme}
              />

              <ToggleRow
                label={t.hideTimer}
                description={t.hideTimerDesc}
                checked={settings.hideTimer}
                onChange={(val) => onUpdateSettings({ hideTimer: val })}
                theme={theme}
              />

              <div
                className="rounded-xl p-4 space-y-3.5"
                style={{
                  backgroundColor: theme.surface,
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium" style={{ color: theme.text }}>
                      {t.metricsBar}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: theme.muted }}>
                      {t.metricsBarDesc}
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.showMetricsBar}
                    onClick={() => onUpdateSettings({ showMetricsBar: !settings.showMetricsBar })}
                    className="shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors flex items-center cursor-pointer"
                    style={{
                      backgroundColor: settings.showMetricsBar ? theme.accent : theme.border,
                      justifyContent: settings.showMetricsBar ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <span
                      className="w-5 h-5 rounded-full transition-transform"
                      style={{
                        backgroundColor: settings.showMetricsBar
                          ? theme.accentText
                          : theme.surfaceElevated,
                      }}
                    />
                  </button>
                </div>

                {settings.showMetricsBar && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <ToggleRow
                        label={t.metricsTime}
                        checked={settings.showMetricsTime}
                        onChange={(val) => onUpdateSettings({ showMetricsTime: val })}
                        theme={theme}
                        compact
                        nested
                      />
                      <ToggleRow
                        label="CPM"
                        checked={settings.showMetricsCpm}
                        onChange={(val) => onUpdateSettings({ showMetricsCpm: val })}
                        theme={theme}
                        compact
                        nested
                      />
                      <ToggleRow
                        label="Raw CPM"
                        checked={settings.showMetricsRawCpm}
                        onChange={(val) => onUpdateSettings({ showMetricsRawCpm: val })}
                        theme={theme}
                        compact
                        nested
                      />
                    </div>

                    <div
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3.5 py-2.5"
                      style={{ backgroundColor: theme.bg }}
                    >
                      <div>
                        <div className="text-[13px] font-medium" style={{ color: theme.text }}>
                          {t.metricsIntervalTitle}
                        </div>
                        <div className="text-[11px]" style={{ color: theme.muted }}>
                          {t.metricsIntervalDesc}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {INTERVAL_PRESETS.map((preset) => {
                          const isSelected = Math.abs(settings.metricsInterval - preset) < 0.01;
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => handlePresetClick(preset)}
                              className="px-2.5 py-1 rounded-md font-mono-typing text-xs transition-colors cursor-pointer whitespace-nowrap"
                              style={{
                                backgroundColor: isSelected ? theme.accent : theme.surface,
                                color: isSelected ? theme.accentText : theme.muted,
                              }}
                            >
                              {preset}s
                            </button>
                          );
                        })}

                        <input
                          type="number"
                          step="0.1"
                          min="0.3"
                          max="10"
                          value={intervalDraft}
                          onChange={(e) => {
                            const next = e.target.value;
                            setIntervalDraft(next);
                            const num = parseFloat(next);
                            if (Number.isFinite(num) && num >= 0.3) {
                              onUpdateSettings({
                                metricsInterval: Math.round(num * 10) / 10,
                              });
                            }
                          }}
                          onBlur={handleIntervalBlur}
                          aria-label={t.metricsIntervalAria}
                          className="w-16 px-2 py-1 rounded-md font-mono-typing text-xs text-center outline-none tabular-nums"
                          style={{
                            backgroundColor: theme.surface,
                            color: theme.text,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'sound' && (
            <div className="space-y-2.5">
              <ToggleRow
                label={t.sfxEnabled}
                description={t.sfxEnabledDesc}
                checked={settings.sfxEnabled}
                onChange={(val) => onUpdateSettings({ sfxEnabled: val })}
                theme={theme}
              />

              <div
                className="rounded-xl p-4 space-y-3 transition-opacity"
                style={{
                  backgroundColor: theme.surface,
                  opacity: settings.sfxEnabled ? 1 : 0.5,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium" style={{ color: theme.text }}>
                      {t.sfxVolume}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: theme.muted }}>
                      {t.sfxVolumeDesc}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="font-mono-typing text-sm font-medium tabular-nums">
                      {settings.sfxVolume}%
                    </span>
                    <button
                      type="button"
                      disabled={!settings.sfxEnabled}
                      onClick={() => playFlipSound(settings.sfxVolume)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-85 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                      style={{
                        backgroundColor: theme.bg,
                        color: theme.text,
                      }}
                    >
                      <Volume2 className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                      <span>{t.test}</span>
                    </button>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  disabled={!settings.sfxEnabled}
                  value={settings.sfxVolume}
                  onChange={(e) => {
                    const vol = Number(e.target.value);
                    onUpdateSettings({ sfxVolume: vol });
                  }}
                  onMouseUp={() => {
                    if (settings.sfxEnabled && settings.sfxVolume > 0) {
                      playFlipSound(settings.sfxVolume);
                    }
                  }}
                  onTouchEnd={() => {
                    if (settings.sfxEnabled && settings.sfxVolume > 0) {
                      playFlipSound(settings.sfxVolume);
                    }
                  }}
                  aria-label={t.sfxVolume}
                  className="w-full cursor-pointer"
                  style={{ accentColor: theme.accent }}
                />
              </div>

              <ToggleRow
                label={t.sfxTyping}
                description={t.sfxTypingDesc}
                checked={settings.sfxTyping}
                disabled={!settings.sfxEnabled}
                onChange={(val) => onUpdateSettings({ sfxTyping: val })}
                theme={theme}
              />

              <ToggleRow
                label={t.sfxFlip}
                description={t.sfxFlipDesc}
                checked={settings.sfxFlip}
                disabled={!settings.sfxEnabled}
                onChange={(val) => onUpdateSettings({ sfxFlip: val })}
                theme={theme}
              />

              {/* Google Account Connection Card */}
              <div
                className="rounded-xl p-4 mt-1 flex flex-wrap items-center justify-between gap-3"
                style={{ backgroundColor: theme.surface }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium" style={{ color: theme.text }}>
                    {t.accountTitle}
                  </div>
                  <div className="text-xs mt-0.5 leading-relaxed" style={{ color: theme.muted }}>
                    {isSignedIn
                      ? `${authUser?.email || ''} · ${t.accountSignedInDesc}`
                      : t.accountSignedOutDesc}
                  </div>
                </div>

                {isSignedIn ? (
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={onSignOutGoogle}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-85 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: theme.bg,
                      color: theme.muted,
                    }}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t.signOutBtn}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={onSignInGoogle}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: theme.accent,
                      color: theme.accentText,
                    }}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{t.signInBtn}</span>
                  </button>
                )}
              </div>

              {/* Nickname Change in Sound & Account Tab */}
              <div
                className="rounded-xl p-4 mt-1"
                style={{ backgroundColor: theme.surface }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-sm font-medium" style={{ color: theme.text }}>
                    {t.nicknameTitle}
                  </div>
                  {isSignedIn && nickname && (
                    <span className="font-mono-typing text-xs" style={{ color: theme.muted }}>
                      {t.nicknameCurrent(nickname)}
                    </span>
                  )}
                </div>
                <p className="text-xs mb-3" style={{ color: theme.muted }}>
                  {isSignedIn ? t.nicknameDesc : t.nicknameLoginNeeded}
                </p>

                {isSignedIn && (
                  <form onSubmit={handleNicknameSubmit} className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={nicknameDraft}
                        onChange={(e) => {
                          setNicknameDraft(e.target.value);
                          if (nicknameError) setNicknameError(null);
                          if (nicknameSuccess) setNicknameSuccess(false);
                        }}
                        maxLength={16}
                        placeholder={t.nicknamePlaceholder}
                        aria-label={t.nicknameTitle}
                        className="w-full rounded-xl px-3.5 py-2.5 font-mono-typing text-sm outline-none transition-colors"
                        style={{
                          backgroundColor: theme.bg,
                          color: theme.text,
                          caretColor: theme.accent,
                        }}
                      />
                      <div
                        className="text-[11px] mt-1.5"
                        style={{
                          color: nicknameError
                            ? theme.aiTile
                            : nicknameSuccess
                              ? theme.accent
                              : theme.muted,
                        }}
                      >
                        {nicknameError
                          ? nicknameError
                          : nicknameSuccess
                            ? t.nicknameUpdated
                            : t.nicknameRuleHint}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={nicknameSaving}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-85 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: theme.accent,
                        color: theme.accentText,
                      }}
                    >
                      {nicknameSaving ? t.saving : t.change}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
