import { Clock, LogIn, ShieldAlert, UserPlus } from 'lucide-react';
import { getRank } from '../data/words';
import {
  COPY,
  formatSpeedUnit,
  formatTimeUnit,
  getDisplayRank,
} from '../i18n/translations';
import { AppLanguage, MatchReport, ThemeConfig } from '../types/game';

interface ResultModalProps {
  open: boolean;
  report: MatchReport | null;
  isSignedIn: boolean;
  hasNickname: boolean;
  authBusy?: boolean;
  lang: AppLanguage;
  theme: ThemeConfig;
  onSignInGoogle: () => void;
  onOpenNicknameSetup: () => void;
  onRestart: () => void;
}

export function ResultModal({
  open,
  report,
  isSignedIn,
  hasNickname,
  authBusy,
  lang,
  theme,
  onSignInGoogle,
  onOpenNicknameSetup,
  onRestart,
}: ResultModalProps) {
  if (!open || !report) return null;

  const t = COPY[lang].result;
  const outcome =
    report.flips > report.aiFlips ? t.win : report.flips < report.aiFlips ? t.loss : t.draw;
  const isStandardMode = report.durationSec === 60;
  const userRank = getDisplayRank(getRank(report.flips), lang);
  const aiRank = getDisplayRank(getRank(report.aiFlips), lang);
  const maxBucketCpm = Math.max(120, ...report.paceBuckets.map((b) => b.cpm));
  const segmentSec = Math.round((report.durationSec / 6) * 10) / 10;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.48)' }}
      role="dialog"
      aria-modal="true"
      aria-label={t.dialogAria}
    >
      <div
        className="w-full max-w-[540px] max-h-[88vh] overflow-y-auto rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5"
        style={{
          backgroundColor: theme.surfaceElevated,
          color: theme.text,
        }}
      >
        {/* Top Outcome & Score */}
        <div className="text-center">
          <div className="text-xs tracking-widest uppercase" style={{ color: theme.muted }}>
            {t.matchOver}
          </div>

          <div className="text-3xl font-semibold mt-1.5" style={{ color: theme.accent }}>
            {outcome}
          </div>

          <div className="font-mono-typing text-5xl font-medium tabular-nums my-2.5">
            {report.flips} <span style={{ color: theme.muted }}>:</span> {report.aiFlips}
          </div>

          {isStandardMode ? (
            <div className="text-sm" style={{ color: theme.muted }}>
              {t.myRank}{' '}
              <span className="font-mono-typing font-semibold" style={{ color: theme.text }}>
                {userRank}
              </span>
              <span className="mx-2">·</span>
              {t.botRank}{' '}
              <span className="font-mono-typing font-semibold" style={{ color: theme.text }}>
                {aiRank}
              </span>
              <span className="mx-2">·</span>
              {formatSpeedUnit(report.aiSpeed, lang)}
            </div>
          ) : (
            <div className="text-sm" style={{ color: theme.muted }}>
              <span className="font-mono-typing font-medium" style={{ color: theme.text }}>
                {formatTimeUnit(report.durationSec, lang)}
              </span>
              <span className="mx-2">·</span>
              <span className="font-mono-typing font-medium" style={{ color: theme.text }}>
                {formatSpeedUnit(report.aiSpeed, lang)}
              </span>
            </div>
          )}
        </div>

        {/* Non-60s Mode Unranked Notice */}
        {!isStandardMode && (
          <div
            className="rounded-xl px-4 py-3 text-center text-xs leading-relaxed"
            style={{
              backgroundColor: theme.surface,
              color: theme.muted,
            }}
          >
            {t.non60Notice}
          </div>
        )}

        {/* Guest Prompt for 60s Mode */}
        {isStandardMode && !isSignedIn && (
          <div
            className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs leading-relaxed"
            style={{
              backgroundColor: theme.surface,
              color: theme.muted,
            }}
          >
            <span className="flex-1 min-w-[200px]">{t.guestPrompt}</span>
            <button
              type="button"
              disabled={authBusy}
              onClick={onSignInGoogle}
              className="px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50 shrink-0 whitespace-nowrap"
              style={{
                backgroundColor: theme.accent,
                color: theme.accentText,
              }}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{t.guestSignInBtn}</span>
            </button>
          </div>
        )}

        {/* Signed-in Without Nickname Prompt for Verified 60s Mode */}
        {isStandardMode && isSignedIn && !hasNickname && report.verified && (
          <div
            className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs leading-relaxed"
            style={{
              backgroundColor: theme.surface,
              color: theme.muted,
            }}
          >
            <span className="flex-1 min-w-[200px]">{t.nicknamePrompt}</span>
            <button
              type="button"
              onClick={onOpenNicknameSetup}
              className="px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer shrink-0 whitespace-nowrap"
              style={{
                backgroundColor: theme.accent,
                color: theme.accentText,
              }}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t.nicknameSetupBtn}</span>
            </button>
          </div>
        )}

        {/* High-Score Pending Admin Approval Notice (>= 220 flips in 60s mode) */}
        {isStandardMode && isSignedIn && report.verified && report.pendingApproval && (
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs leading-relaxed"
            style={{
              backgroundColor: theme.surface,
              color: theme.accent,
            }}
          >
            <Clock className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t.pendingApproval}</span>
          </div>
        )}

        {/* Anti-Cheat Flag Warning (if unverified) */}
        {!report.verified && report.cheatReason && (
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs leading-relaxed"
            style={{
              backgroundColor: theme.surface,
              color: theme.aiTile,
            }}
          >
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{report.cheatReason}</span>
          </div>
        )}

        {/* 3-Column Key Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div
            className="rounded-xl px-3 py-2.5 text-center"
            style={{ backgroundColor: theme.surface }}
          >
            <div className="text-[11px]" style={{ color: theme.muted }}>
              CPM
            </div>
            <div className="font-mono-typing text-lg font-semibold tabular-nums mt-0.5">
              {report.cpm}
            </div>
          </div>

          <div
            className="rounded-xl px-3 py-2.5 text-center"
            style={{ backgroundColor: theme.surface }}
          >
            <div className="text-[11px]" style={{ color: theme.muted }}>
              RAW
            </div>
            <div className="font-mono-typing text-lg font-semibold tabular-nums mt-0.5">
              {report.rawCpm}
            </div>
          </div>

          <div
            className="rounded-xl px-3 py-2.5 text-center"
            style={{ backgroundColor: theme.surface }}
          >
            <div className="text-[11px]" style={{ color: theme.muted }}>
              ACC
            </div>
            <div
              className="font-mono-typing text-lg font-semibold tabular-nums mt-0.5"
              style={{ color: report.accuracy >= 95 ? theme.accent : theme.text }}
            >
              {report.accuracy.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Interval Pace Breakdown */}
        <div className="rounded-xl p-4" style={{ backgroundColor: theme.surface }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium" style={{ color: theme.text }}>
              {t.paceTitle}
            </span>
            <span className="text-[11px]" style={{ color: theme.muted }}>
              {t.intervalUnit(segmentSec)}
            </span>
          </div>

          <div className="grid grid-cols-6 gap-2 items-end h-24 pt-2">
            {report.paceBuckets.map((bucket) => {
              const heightPct =
                bucket.cpm > 0
                  ? Math.max(12, Math.round((bucket.cpm / maxBucketCpm) * 100))
                  : 6;
              return (
                <div key={bucket.label} className="flex flex-col items-center gap-1 h-full justify-end">
                  <span
                    className="font-mono-typing text-[10px] tabular-nums"
                    style={{ color: bucket.cpm > 0 ? theme.text : theme.muted }}
                  >
                    {bucket.cpm}
                  </span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: bucket.cpm > 0 ? theme.accent : theme.bg,
                        opacity: bucket.cpm > 0 ? 0.9 : 0.6,
                      }}
                    />
                  </div>
                  <span className="font-mono-typing text-[10px]" style={{ color: theme.muted }}>
                    {bucket.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onRestart}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 cursor-pointer"
          style={{
            backgroundColor: theme.accent,
            color: theme.accentText,
          }}
        >
          {t.playAgain}
        </button>
      </div>
    </div>
  );
}
