import { X } from 'lucide-react';
import { RANKS, getRank } from '../data/words';
import { COPY, getDisplayRank } from '../i18n/translations';
import { AppLanguage, ThemeConfig } from '../types/game';

interface RankModalProps {
  open: boolean;
  bestFlips: number;
  lang: AppLanguage;
  theme: ThemeConfig;
  onClose: () => void;
}

export function RankModal({ open, bestFlips, lang, theme, onClose }: RankModalProps) {
  if (!open) return null;

  const t = COPY[lang].rank;
  const bestRank = bestFlips > 0 ? getRank(bestFlips) : 'Unranked';
  const eliteRanks = RANKS.filter(([, cutoff]) => cutoff >= 150);
  const standardRanks = RANKS.filter(([, cutoff]) => cutoff < 150);

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
        className="w-full max-w-[440px] max-h-[84vh] overflow-y-auto rounded-2xl p-6 sm:p-7 shadow-2xl transition-colors"
        style={{
          backgroundColor: theme.surfaceElevated,
          color: theme.text,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold tracking-tight" style={{ color: theme.muted }}>
            Rank System
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80 cursor-pointer"
            style={{
              backgroundColor: theme.surface,
              color: theme.text,
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Personal Best Summary */}
        <div
          className="rounded-xl px-4 py-3.5 mb-5 flex items-baseline justify-between gap-4"
          style={{ backgroundColor: theme.surface }}
        >
          <div>
            <div className="text-xs mb-1" style={{ color: theme.muted }}>
              {t.personalBest}
            </div>
            <div
              className="font-mono-typing text-3xl font-semibold tracking-tight"
              style={{ color: bestFlips >= 150 ? theme.accent : theme.text }}
            >
              {getDisplayRank(bestRank, lang)}
            </div>
          </div>
          <div className="font-mono-typing text-sm tabular-nums" style={{ color: theme.muted }}>
            {bestFlips} flips
          </div>
        </div>

        {/* Upper Tiers (X and above) */}
        <div className="space-y-1.5 mb-5">
          {eliteRanks.map(([name, cutoff], idx) => {
            const isCurrent = bestFlips > 0 && bestRank === name;
            const isApex = idx === 0;
            const displayName = getDisplayRank(name, lang);

            if (isApex) {
              return (
                <div
                  key={name}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl mb-2"
                  style={{
                    backgroundColor: theme.accent,
                    color: theme.accentText,
                  }}
                >
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-mono-typing text-base font-semibold tracking-tight">
                      {displayName}
                    </span>
                    {isCurrent && (
                      <span className="text-[11px] font-medium opacity-80">{t.current}</span>
                    )}
                  </div>
                  <span className="font-mono-typing text-xs font-medium tabular-nums opacity-90">
                    {cutoff}+
                  </span>
                </div>
              );
            }

            return (
              <div
                key={name}
                className="flex items-center justify-between px-3.5 py-2 rounded-xl"
                style={{
                  backgroundColor: isCurrent ? theme.surface : theme.bg,
                }}
              >
                <div className="flex items-baseline gap-2.5">
                  <span
                    className="font-mono-typing text-[15px] font-semibold tracking-tight"
                    style={{ color: theme.accent }}
                  >
                    {displayName}
                  </span>
                  {isCurrent && (
                    <span className="text-[11px]" style={{ color: theme.muted }}>
                      {t.current}
                    </span>
                  )}
                </div>
                <span
                  className="font-mono-typing text-xs tabular-nums"
                  style={{ color: theme.text }}
                >
                  {cutoff}+
                </span>
              </div>
            );
          })}
        </div>

        {/* Standard Tiers (Below X) */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
          {standardRanks.map(([name, cutoff]) => {
            const isCurrent = bestFlips > 0 && bestRank === name;
            return (
              <div
                key={name}
                className="flex items-baseline justify-between px-2.5 py-1.5 rounded-lg text-xs"
                style={{
                  backgroundColor: isCurrent ? theme.surface : 'transparent',
                }}
              >
                <span
                  className={`font-mono-typing ${isCurrent ? 'font-semibold' : 'font-medium'}`}
                  style={{ color: isCurrent ? theme.accent : theme.text }}
                >
                  {name}
                </span>
                <span
                  className="font-mono-typing text-[11px] tabular-nums"
                  style={{ color: theme.muted }}
                >
                  {cutoff}+
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
