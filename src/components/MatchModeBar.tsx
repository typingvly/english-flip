import { FormEvent, useEffect, useState } from 'react';
import { DIFFICULTY_OPTIONS } from '../data/words';
import {
  COPY,
  formatSpeedUnit,
  formatTimeUnit,
  getDifficultyTierLabel,
} from '../i18n/translations';
import { AppLanguage, DifficultySpeed, ThemeConfig } from '../types/game';

const DURATION_PRESETS = [15, 30, 60, 120, 300, 600];
const MIN_DURATION_SEC = 10;
const MAX_DURATION_SEC = 3600;

interface MatchModeBarProps {
  aiSpeed: DifficultySpeed;
  durationSec: number;
  disabled: boolean;
  dimmed: boolean;
  lang: AppLanguage;
  theme: ThemeConfig;
  onSelectSpeed: (speed: DifficultySpeed) => void;
  onSelectDuration: (seconds: number) => void;
}

export function MatchModeBar({
  aiSpeed,
  durationSec,
  disabled,
  dimmed,
  lang,
  theme,
  onSelectSpeed,
  onSelectDuration,
}: MatchModeBarProps) {
  const [openMenu, setOpenMenu] = useState<'speed' | 'duration' | null>(null);
  const [hoveredMenu, setHoveredMenu] = useState<'speed' | 'duration' | null>(null);
  const [customSecInput, setCustomSecInput] = useState<string>(String(durationSec));
  const t = COPY[lang].modeBar;

  useEffect(() => {
    setCustomSecInput(String(durationSec));
  }, [durationSec]);

  useEffect(() => {
    if (disabled) {
      setOpenMenu(null);
      setHoveredMenu(null);
    }
  }, [disabled]);

  const applyCustomDuration = (e: FormEvent) => {
    e.preventDefault();
    const parsed = Math.round(Number(customSecInput));
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(MIN_DURATION_SEC, Math.min(MAX_DURATION_SEC, parsed));
    onSelectDuration(clamped);
    setCustomSecInput(String(clamped));
    setOpenMenu(null);
  };

  const isSpeedOpen = !disabled && openMenu === 'speed';
  const isDurationOpen = !disabled && openMenu === 'duration';

  return (
    <div
      className={`relative z-20 w-full max-w-[780px] flex items-center justify-center gap-2 mb-3.5 sm:mb-4 transition-opacity duration-200 ${
        dimmed ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Left: AI Speed Selector Button + Hover/Click Popover */}
      <div
        className="relative"
        onMouseEnter={() => {
          if (disabled) return;
          setHoveredMenu('speed');
          setOpenMenu('speed');
        }}
        onMouseLeave={() => {
          setHoveredMenu((prev) => (prev === 'speed' ? null : prev));
          setOpenMenu((prev) => (prev === 'speed' ? null : prev));
        }}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setOpenMenu((prev) => (prev === 'speed' ? null : 'speed'));
          }}
          aria-expanded={isSpeedOpen}
          aria-label={t.speedAria}
          className="h-8 px-3 rounded-lg font-mono-typing text-xs font-medium tabular-nums transition-colors duration-150 cursor-pointer disabled:opacity-55 disabled:cursor-default whitespace-nowrap shrink-0"
          style={{
            backgroundColor:
              hoveredMenu === 'speed' || isSpeedOpen
                ? theme.surfaceElevated
                : theme.surface,
            color:
              hoveredMenu === 'speed' || isSpeedOpen ? theme.accent : theme.text,
          }}
        >
          {formatSpeedUnit(aiSpeed, lang)}
        </button>

        {isSpeedOpen && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full pt-1.5 z-30">
            <div
              className="w-[244px] rounded-2xl p-3 shadow-2xl space-y-2"
              style={{
                backgroundColor: theme.surfaceElevated,
                color: theme.text,
              }}
            >
              <div
                className="text-[11px] font-medium px-1"
                style={{ color: theme.muted }}
              >
                {t.speedTitle}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {DIFFICULTY_OPTIONS.map((opt) => {
                  const active = aiSpeed === opt.speed;
                  return (
                    <button
                      key={opt.speed}
                      type="button"
                      onClick={() => {
                        onSelectSpeed(opt.speed);
                        setOpenMenu(null);
                      }}
                      className="rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer hover:brightness-105"
                      style={{
                        backgroundColor: active ? theme.accent : theme.surface,
                        color: active ? theme.accentText : theme.text,
                      }}
                    >
                      <div className="font-mono-typing text-xs font-semibold tabular-nums whitespace-nowrap">
                        {formatSpeedUnit(opt.speed, lang)}
                      </div>
                      <div
                        className="text-[10px] mt-0.5"
                        style={{
                          color: active ? theme.accentText : theme.muted,
                          opacity: active ? 0.85 : 1,
                        }}
                      >
                        {getDifficultyTierLabel(opt.speed, lang)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: Match Duration Selector Button + Hover/Click Popover */}
      <div
        className="relative"
        onMouseEnter={() => {
          if (disabled) return;
          setHoveredMenu('duration');
          setOpenMenu('duration');
        }}
        onMouseLeave={() => {
          setHoveredMenu((prev) => (prev === 'duration' ? null : prev));
          setOpenMenu((prev) => (prev === 'duration' ? null : prev));
        }}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setOpenMenu((prev) => (prev === 'duration' ? null : 'duration'));
          }}
          aria-expanded={isDurationOpen}
          aria-label={t.durationAria}
          className="h-8 px-3 rounded-lg font-mono-typing text-xs font-medium tabular-nums transition-colors duration-150 cursor-pointer disabled:opacity-55 disabled:cursor-default whitespace-nowrap shrink-0"
          style={{
            backgroundColor:
              hoveredMenu === 'duration' || isDurationOpen
                ? theme.surfaceElevated
                : theme.surface,
            color:
              hoveredMenu === 'duration' || isDurationOpen
                ? theme.accent
                : durationSec !== 60
                  ? theme.muted
                  : theme.text,
          }}
        >
          {formatTimeUnit(durationSec, lang)}
        </button>

        {isDurationOpen && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full pt-1.5 z-30">
            <div
              className="w-[264px] rounded-2xl p-3.5 shadow-2xl space-y-2.5"
              style={{
                backgroundColor: theme.surfaceElevated,
                color: theme.text,
              }}
            >
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[11px] font-medium" style={{ color: theme.muted }}>
                  {t.durationTitle}
                </span>
                <span className="text-[10px]" style={{ color: theme.muted }}>
                  {t.durationRange}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {DURATION_PRESETS.map((sec) => {
                  const active = durationSec === sec;
                  return (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        onSelectDuration(sec);
                        setOpenMenu(null);
                      }}
                      className="rounded-xl py-2 font-mono-typing text-xs font-semibold tabular-nums transition-colors cursor-pointer hover:brightness-105"
                      style={{
                        backgroundColor: active ? theme.accent : theme.surface,
                        color: active ? theme.accentText : theme.text,
                      }}
                    >
                      {formatTimeUnit(sec, lang)}
                    </button>
                  );
                })}
              </div>

              <form onSubmit={applyCustomDuration} className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={MIN_DURATION_SEC}
                  max={MAX_DURATION_SEC}
                  value={customSecInput}
                  onChange={(e) => setCustomSecInput(e.target.value)}
                  aria-label={t.customAria}
                  placeholder={t.customPlaceholder}
                  className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 font-mono-typing text-xs tabular-nums outline-none"
                  style={{
                    backgroundColor: theme.surface,
                    color: theme.text,
                  }}
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 cursor-pointer shrink-0 whitespace-nowrap"
                  style={{
                    backgroundColor: theme.accent,
                    color: theme.accentText,
                  }}
                >
                  {t.apply}
                </button>
              </form>

              <div
                className="text-[11px] leading-relaxed px-0.5"
                style={{
                  color: durationSec === 60 ? theme.muted : theme.aiTile,
                }}
              >
                {t.standardOnlyNote}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
