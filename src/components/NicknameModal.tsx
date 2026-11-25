import { FormEvent, useEffect, useState } from 'react';
import { COPY } from '../i18n/translations';
import { validateNickname } from '../services/leaderboard';
import { AppLanguage, ThemeConfig } from '../types/game';

interface NicknameModalProps {
  open: boolean;
  initialNickname?: string;
  lang: AppLanguage;
  theme: ThemeConfig;
  onSubmit: (nickname: string) => Promise<void>;
  onDismiss?: () => void;
}

export function NicknameModal({
  open,
  initialNickname = '',
  lang,
  theme,
  onSubmit,
  onDismiss,
}: NicknameModalProps) {
  const [value, setValue] = useState(initialNickname);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialNickname);
      setError(null);
    }
  }, [open, initialNickname]);

  if (!open) return null;

  const t = COPY[lang].nicknameModal;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const check = validateNickname(value, lang);
    if (!check.valid) {
      setError(check.error || t.checkError);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(check.trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.submitError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.58)' }}
      role="dialog"
      aria-modal="true"
      aria-label={t.dialogAria}
    >
      <div
        className="w-full max-w-[420px] rounded-2xl p-7 shadow-2xl"
        style={{
          backgroundColor: theme.surfaceElevated,
          color: theme.text,
        }}
      >
        <div className="text-xs tracking-widest uppercase" style={{ color: theme.muted }}>
          {t.welcome}
        </div>
        <h2 className="text-xl font-semibold mt-1.5 tracking-tight">{t.title}</h2>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: theme.muted }}>
          {t.descLine1}
          <br />
          {t.descLine2}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div>
            <input
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              maxLength={16}
              autoFocus
              placeholder={t.placeholder}
              aria-label={t.ariaInput}
              className="w-full rounded-xl px-4 py-3 font-mono-typing text-base outline-none transition-colors"
              style={{
                backgroundColor: theme.surface,
                boxShadow: error ? `0 0 0 2px ${theme.aiTile}` : 'none',
                color: theme.text,
                caretColor: theme.accent,
              }}
            />
            <div className="mt-1.5 text-[11px]" style={{ color: error ? theme.aiTile : theme.muted }}>
              {error ?? t.ruleHint}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onDismiss && (
              <button
                type="button"
                disabled={submitting}
                onClick={onDismiss}
                className="px-4 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-85 cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: theme.surface,
                  color: theme.muted,
                }}
              >
                {t.later}
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: theme.accent,
                color: theme.accentText,
              }}
            >
              {submitting ? t.submitting : t.submit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
