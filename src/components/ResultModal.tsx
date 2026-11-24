import { getRank } from '../data/words';
import { DifficultySpeed, ThemeConfig } from '../types/game';

interface ResultModalProps {
  open: boolean;
  flips: number;
  aiFlips: number;
  aiSpeed: DifficultySpeed;
  cpm: number;
  rawCpm: number;
  theme: ThemeConfig;
  onRestart: () => void;
}

export function ResultModal({
  open,
  flips,
  aiFlips,
  aiSpeed,
  cpm,
  rawCpm,
  theme,
  onRestart,
}: ResultModalProps) {
  if (!open) return null;

  const outcome = flips > aiFlips ? '승리' : flips < aiFlips ? '패배' : '무승부';
  const userRank = getRank(flips);
  const aiRank = getRank(aiFlips);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.42)' }}
      role="dialog"
      aria-modal="true"
      aria-label="대결 결과"
    >
      <div
        className="w-full max-w-[420px] rounded-2xl p-7 text-center shadow-2xl"
        style={{
          backgroundColor: theme.surfaceElevated,
          color: theme.text,
        }}
      >
        <div className="text-xs tracking-widest uppercase" style={{ color: theme.muted }}>
          대결 종료
        </div>

        <div className="text-3xl font-semibold mt-2" style={{ color: theme.accent }}>
          {outcome}
        </div>

        <div className="font-mono-typing text-5xl font-medium tabular-nums my-3">
          {flips} <span style={{ color: theme.muted }}>:</span> {aiFlips}
        </div>

        <div className="text-sm space-y-1 mb-6" style={{ color: theme.muted }}>
          <div>
            내 랭크 <span className="font-mono-typing font-medium" style={{ color: theme.text }}>{userRank}</span>
            <span className="mx-2">·</span>
            봇 랭크 <span className="font-mono-typing font-medium" style={{ color: theme.text }}>{aiRank}</span>
            <span className="mx-2">·</span>
            {aiSpeed}타
          </div>
          <div className="font-mono-typing text-xs">
            CPM {cpm} · Raw {rawCpm}
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
          다시하기
        </button>
      </div>
    </div>
  );
}
