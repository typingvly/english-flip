import { FormEvent, useState } from 'react';
import { validateNickname } from '../services/leaderboard';
import { ThemeConfig } from '../types/game';

interface NicknameModalProps {
  open: boolean;
  theme: ThemeConfig;
  onSubmit: (nickname: string) => Promise<void>;
}

export function NicknameModal({ open, theme, onSubmit }: NicknameModalProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const check = validateNickname(value);
    if (!check.valid) {
      setError(check.error || '닉네임을 확인해 주세요.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(check.trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : '닉네임 등록 중 오류가 발생했습니다.');
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
      aria-label="닉네임 설정"
    >
      <div
        className="w-full max-w-[420px] rounded-2xl p-7 shadow-2xl"
        style={{
          backgroundColor: theme.surfaceElevated,
          color: theme.text,
        }}
      >
        <div className="text-xs tracking-widest uppercase" style={{ color: theme.muted }}>
          Welcome
        </div>
        <h2 className="text-xl font-semibold mt-1.5 tracking-tight">닉네임 설정</h2>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: theme.muted }}>
          글로벌 리더보드에 사용할 고유 닉네임을 입력해 주세요.
          <br />
          닉네임은 추후 소리 설정에서 변경할 수 있습니다.
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
              placeholder="닉네임 입력 (2~16자)"
              aria-label="닉네임"
              className="w-full rounded-xl px-4 py-3 font-mono-typing text-base outline-none transition-colors"
              style={{
                backgroundColor: theme.surface,
                boxShadow: error ? `0 0 0 2px ${theme.aiTile}` : 'none',
                color: theme.text,
                caretColor: theme.accent,
              }}
            />
            <div className="mt-1.5 text-[11px]" style={{ color: error ? theme.aiTile : theme.muted }}>
              {error ?? '2~16자 한글, 영문, 숫자, 밑줄(_), 하이픈(-) 사용 가능 (중복 불가)'}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50"
            style={{
              backgroundColor: theme.accent,
              color: theme.accentText,
            }}
          >
            {submitting ? '확인 중...' : '시작하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
