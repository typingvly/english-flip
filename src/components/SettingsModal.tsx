import { FormEvent, useEffect, useState } from 'react';
import { Check, RotateCcw, Volume2, X } from 'lucide-react';
import { FONT_LIST } from '../data/fonts';
import { buildCustomTheme, DEFAULT_CUSTOM_THEME, PRESET_THEME_LIST } from '../data/themes';
import { validateNickname } from '../services/leaderboard';
import { CustomThemeColors, FontId, GameSettings, ThemeConfig, ThemeId } from '../types/game';
import { playFlipSound } from '../utils/sound';

interface SettingsModalProps {
  open: boolean;
  settings: GameSettings;
  nickname: string;
  theme: ThemeConfig;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onChangeNickname: (nextNickname: string) => Promise<void>;
  onClose: () => void;
}

type SettingsTab = 'design' | 'gameplay' | 'sound';

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
        <div className={`${compact ? 'text-[13px]' : 'text-sm'} font-medium`} style={{ color: theme.text }}>
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

const CUSTOM_COLOR_FIELDS: ReadonlyArray<{
  key: keyof CustomThemeColors;
  label: string;
}> = [
  { key: 'bg', label: '배경색' },
  { key: 'text', label: '글자색' },
  { key: 'userTile', label: '내 판 색' },
  { key: 'aiTile', label: '상대 판 색' },
  { key: 'accent', label: '강조색' },
];

export function SettingsModal({
  open,
  settings,
  nickname,
  theme,
  onUpdateSettings,
  onChangeNickname,
  onClose,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('design');
  const [intervalDraft, setIntervalDraft] = useState<string>(String(settings.metricsInterval));
  const [nicknameDraft, setNicknameDraft] = useState<string>(nickname);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [nicknameSuccess, setNicknameSuccess] = useState<boolean>(false);
  const [nicknameSaving, setNicknameSaving] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      setNicknameDraft(nickname);
      setNicknameError(null);
      setNicknameSuccess(false);
    }
  }, [open, nickname]);

  if (!open) return null;

  const handleNicknameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (nicknameSaving) return;

    const check = validateNickname(nicknameDraft);
    if (!check.valid) {
      setNicknameError(check.error || '닉네임을 확인해 주세요.');
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
      setNicknameError(
        err instanceof Error ? err.message : '닉네임 변경 중 오류가 발생했습니다.',
      );
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
      aria-label="설정"
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
              디자인 설정
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
              게임플레이 설정
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
              소리 설정
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
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
                <div className="text-sm font-medium mb-1">테마</div>
                <p className="text-xs mb-3.5" style={{ color: theme.muted }}>
                  선택한 테마는 배경, 타일, 입력창, 상단 타임바에 즉시 적용됩니다.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[...PRESET_THEME_LIST, buildCustomTheme(settings.customTheme)].map((item) => {
                    const active = settings.themeId === item.id;
                    const leftBg = settings.swapSides ? item.userTile : item.aiTile;
                    const leftText = settings.swapSides ? item.userTileText : item.aiTileText;
                    const leftLabel = settings.swapSides ? '나' : 'AI';
                    const rightBg = settings.swapSides ? item.aiTile : item.userTile;
                    const rightText = settings.swapSides ? item.aiTileText : item.userTileText;
                    const rightLabel = settings.swapSides ? 'AI' : '나';

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
                            <div className="text-sm font-medium leading-tight">{item.name}</div>
                            <div className="text-[11px] mt-0.5" style={{ color: item.muted }}>
                              {item.subtitle}
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

                {/* Custom Theme Color Editor (shown when 10th theme '사용자 설정' is selected) */}
                {settings.themeId === 'custom' && (
                  <div
                    className="mt-3 rounded-xl p-4 space-y-3"
                    style={{ backgroundColor: theme.surface }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold" style={{ color: theme.text }}>
                          사용자 테마 색상 편집
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: theme.muted }}>
                          타일 글자와 보조 표면 색상은 배경 명도에 맞춰 자동 보정됩니다.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({ customTheme: DEFAULT_CUSTOM_THEME })
                        }
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-opacity hover:opacity-80 cursor-pointer shrink-0"
                        style={{
                          backgroundColor: theme.bg,
                          color: theme.muted,
                        }}
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>초기화</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {CUSTOM_COLOR_FIELDS.map((field) => {
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
                              <div className="text-xs font-medium leading-tight" style={{ color: theme.text }}>
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
                <div className="text-sm font-medium mb-1">글꼴</div>
                <p className="text-xs mb-3.5" style={{ color: theme.muted }}>
                  단어 판과 입력창, 지표에 적용할 가독성 좋은 글꼴을 선택하세요.
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
                              {font.category}
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
            </>
          )}

          {tab === 'gameplay' && (
            <div className="space-y-2.5">
              <ToggleRow
                label="진영 변경"
                description="AI 판(기본 왼쪽)과 내 판(기본 오른쪽)의 좌우 위치를 맞바꿉니다."
                checked={settings.swapSides}
                onChange={(val) => onUpdateSettings({ swapSides: val })}
                theme={theme}
              />

              <ToggleRow
                label="빈 입력 상태에서 Space 입력 방지"
                description="아무 글자도 입력하지 않았을 때 실수로 Space가 입력되는 것을 막습니다."
                checked={settings.preventEmptySpace}
                onChange={(val) => onUpdateSettings({ preventEmptySpace: val })}
                theme={theme}
              />

              <ToggleRow
                label="상단 시간 바 표시"
                description="화면 최상단에 테마 색상 기반의 남은 시간 진행 바를 표시합니다."
                checked={settings.showTimeBar}
                onChange={(val) => onUpdateSettings({ showTimeBar: val })}
                theme={theme}
              />

              <ToggleRow
                label="뒤집은 판 개수 숨기기"
                description="플레이 중 나와 AI 봇이 뒤집은 판 점수 표시를 숨깁니다."
                checked={settings.hideScores}
                onChange={(val) => onUpdateSettings({ hideScores: val })}
                theme={theme}
              />

              <ToggleRow
                label="남은 시간 숨기기"
                description="플레이 중 중앙의 대형 남은 시간 타이머를 숨깁니다."
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
                      간단한 지표 한 줄 표시
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: theme.muted }}>
                      게임 화면에 부연 설명 없이 숫자만 한 줄로 간결하게 표시합니다. (예: 0:35 · 688 · 813)
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
                        label="남은 시간 초수"
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
                          지표 갱신 시간 (초)
                        </div>
                        <div className="text-[11px]" style={{ color: theme.muted }}>
                          최소 0.3초 이상 · 기본값 1초
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
                          aria-label="갱신 시간(초)"
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
                label="효과음 사용"
                description="게임 내 타이핑 및 판 뒤집기 효과음을 켜거나 끕니다."
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
                      효과음 볼륨
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: theme.muted }}>
                      입력음과 판 뒤집기 효과음 크기를 조절합니다.
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
                      <span>테스트</span>
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
                  aria-label="효과음 볼륨"
                  className="w-full cursor-pointer"
                  style={{ accentColor: theme.accent }}
                />
              </div>

              <ToggleRow
                label="입력 사운드"
                description="단어를 타이핑할 때 가벼운 키 입력음을 재생합니다."
                checked={settings.sfxTyping}
                disabled={!settings.sfxEnabled}
                onChange={(val) => onUpdateSettings({ sfxTyping: val })}
                theme={theme}
              />

              <ToggleRow
                label="판 뒤집기 사운드"
                description="내가 상대 판을 뒤집었을 때 효과음을 재생합니다."
                checked={settings.sfxFlip}
                disabled={!settings.sfxEnabled}
                onChange={(val) => onUpdateSettings({ sfxFlip: val })}
                theme={theme}
              />

              {/* Nickname Change in Sound Tab */}
              <div
                className="rounded-xl p-4 mt-1"
                style={{ backgroundColor: theme.surface }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-sm font-medium" style={{ color: theme.text }}>
                    닉네임 변경
                  </div>
                  {nickname && (
                    <span className="font-mono-typing text-xs" style={{ color: theme.muted }}>
                      현재: {nickname}
                    </span>
                  )}
                </div>
                <p className="text-xs mb-3" style={{ color: theme.muted }}>
                  리더보드에 표시되는 고유 닉네임을 변경합니다. 기존 최고 기록은 유지됩니다.
                </p>

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
                      placeholder="새 닉네임 (2~16자)"
                      aria-label="새 닉네임"
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
                          ? '닉네임이 변경되었습니다.'
                          : '2~16자 한글, 영문, 숫자, _, - 사용 가능 (중복 불가)'}
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
                    {nicknameSaving ? '저장 중' : '변경'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
