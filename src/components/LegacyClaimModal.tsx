import { FormEvent, useEffect, useState } from 'react';
import { History, Sparkles } from 'lucide-react';
import { COPY, getDisplayRank } from '../i18n/translations';
import { LegacyLeaderboardCandidate } from '../services/auth';
import { validateNickname } from '../services/leaderboard';
import { AppLanguage, ThemeConfig } from '../types/game';

interface LegacyClaimModalProps {
  candidate: LegacyLeaderboardCandidate | null;
  existingNickname?: string;
  defaultNickname?: string;
  lang: AppLanguage;
  theme: ThemeConfig;
  onClaim: (chosenNickname?: string) => Promise<void>;
  onStartFresh: () => void;
}

export function LegacyClaimModal({
  candidate,
  existingNickname,
  defaultNickname,
  lang,
  theme,
  onClaim,
  onStartFresh,
}: LegacyClaimModalProps) {
  const [nicknameInput, setNicknameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLocalGuest = candidate?.source === 'local';
  const needsNicknameInput = Boolean(isLocalGuest && !existingNickname);

  useEffect(() => {
    if (!candidate) return;
    setError(null);
    setNicknameInput(existingNickname || defaultNickname || candidate.nickname || '');
  }, [candidate, defaultNickname, existingNickname]);

  if (!candidate) return null;

  const t = COPY[lang].legacyClaim;

  const submitClaim = async () => {
    if (submitting) return;
    let chosenNickname: string | undefined;

    if (needsNicknameInput) {
      const check = validateNickname(nicknameInput, lang);
      if (!check.valid) {
        setError(check.error || t.nicknameCheckError);
        return;
      }
      chosenNickname = check.trimmed;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onClaim(chosenNickname);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.claimError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitClaim();
  };

  const kickerText = isLocalGuest ? t.guestKicker : t.kicker;
  const titleText = isLocalGuest ? t.guestTitle : t.title;
  const descText = !isLocalGuest
    ? t.desc
    : existingNickname
      ? t.guestExistingNickDesc
      : t.guestDesc;
  const summaryNickname = existingNickname || candidate.nickname || t.guestNicknameValue;
  const primaryLabel = submitting
    ? t.claiming
    : isLocalGuest
      ? t.guestClaimBtn
      : t.claimBtn;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-label={t.dialogAria}
    >
      <div
        className="w-full max-w-[440px] rounded-2xl p-6 sm:p-7 shadow-2xl transition-colors"
        style={{
          backgroundColor: theme.surfaceElevated,
          color: theme.text,
        }}
      >
        <div className="space-y-1.5">
          <div
            className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wider uppercase"
            style={{ color: theme.accent }}
          >
            <History className="w-3.5 h-3.5" />
            <span>{kickerText}</span>
          </div>
          <h2 className="text-xl font-semibold tracking-tight">{titleText}</h2>
          <p className="text-xs leading-relaxed" style={{ color: theme.muted }}>
            {descText}
          </p>
        </div>

        {/* Summary Card */}
        <div
          className="mt-5 rounded-xl p-4 grid grid-cols-3 gap-3 items-center"
          style={{ backgroundColor: theme.surface }}
        >
          <div className="min-w-0">
            <div className="text-[11px]" style={{ color: theme.muted }}>
              {t.nicknameLabel}
            </div>
            <div className="font-mono-typing text-sm font-semibold truncate mt-0.5">
              {summaryNickname}
            </div>
          </div>

          <div className="text-center">
            <div className="text-[11px]" style={{ color: theme.muted }}>
              {t.bestFlipsLabel}
            </div>
            <div className="font-mono-typing text-lg font-semibold tabular-nums mt-0.5">
              {candidate.bestFlips}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px]" style={{ color: theme.muted }}>
              {t.rankLabel}
            </div>
            <div
              className="font-mono-typing text-lg font-semibold mt-0.5"
              style={{ color: theme.accent }}
            >
              {getDisplayRank(candidate.rank, lang)}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {needsNicknameInput && (
            <div className="space-y-1.5">
              <label
                htmlFor="legacy-claim-nickname"
                className="block text-xs font-medium"
                style={{ color: theme.muted }}
              >
                {t.nicknameInputLabel}
              </label>
              <input
                id="legacy-claim-nickname"
                type="text"
                value={nicknameInput}
                onChange={(e) => {
                  setNicknameInput(e.target.value);
                  if (error) setError(null);
                }}
                maxLength={16}
                autoFocus
                autoComplete="off"
                placeholder={t.nicknamePlaceholder}
                className="w-full rounded-xl px-4 py-3 text-sm font-mono-typing outline-none transition-shadow"
                style={{
                  backgroundColor: theme.surface,
                  color: theme.text,
                  boxShadow: `0 0 0 2px ${error ? theme.aiTile : theme.accent}`,
                }}
              />
              <p className="text-[11px]" style={{ color: theme.muted }}>
                {t.nicknameRuleHint}
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs leading-relaxed" style={{ color: theme.aiTile }}>
              {error}
            </p>
          )}

          <div className="space-y-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-55 cursor-pointer"
              style={{
                backgroundColor: theme.accent,
                color: theme.accentText,
              }}
            >
              <Sparkles className="w-4 h-4" />
              <span>{primaryLabel}</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={onStartFresh}
              className="w-full py-2.5 rounded-xl text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 cursor-pointer"
              style={{
                backgroundColor: theme.surface,
                color: theme.muted,
              }}
            >
              {t.startFreshBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
