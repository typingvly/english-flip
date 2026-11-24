import { DIFFICULTY_OPTIONS } from '../data/words';
import { DifficultySpeed, ThemeConfig } from '../types/game';

interface StartOverlayProps {
  open: boolean;
  aiSpeed: DifficultySpeed;
  theme: ThemeConfig;
  onSelectSpeed: (speed: DifficultySpeed) => void;
  onStart: () => void;
}

export function StartOverlay({
  open,
  aiSpeed,
  theme,
  onSelectSpeed,
  onStart,
}: StartOverlayProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-auto"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.32)' }}
    >
      <div
        className="w-full max-w-[440px] rounded-2xl p-7 text-center shadow-2xl"
        style={{
          backgroundColor: theme.surfaceElevated,
          color: theme.text,
        }}
      >
        <div className="text-xs tracking-widest uppercase" style={{ color: theme.muted }}>
          1 Minute Battle
        </div>
        <h1 className="text-3xl font-bold mt-2 tracking-tight">
          <span style={{ color: theme.text }}>English</span>
          <span style={{ color: theme.accent }}>Flip</span>
        </h1>
        <p className="text-sm mt-3 leading-relaxed" style={{ color: theme.muted }}>
          상대 팀(
          <span className="font-medium" style={{ color: theme.aiTile }}>
            AI
          </span>
          ) 색상의 단어를 입력해 내 팀(
          <span className="font-medium" style={{ color: theme.userTile }}>
            나
          </span>
          ) 색상으로 뒤집으세요.
          <br />
          Space 또는 Enter로 단어를 전환합니다.
        </p>

        <div className="grid grid-cols-4 gap-2 my-6">
          {DIFFICULTY_OPTIONS.map((opt) => {
            const active = aiSpeed === opt.speed;
            return (
              <button
                key={opt.speed}
                type="button"
                onClick={() => onSelectSpeed(opt.speed)}
                className="rounded-xl py-2.5 px-1 transition-colors cursor-pointer"
                style={{
                  backgroundColor: active ? theme.accent : theme.surface,
                  color: active ? theme.accentText : theme.text,
                }}
              >
                <div className="font-mono-typing text-sm font-medium whitespace-nowrap">
                  {opt.label}
                </div>
                <div
                  className="text-[11px] mt-0.5"
                  style={{ color: active ? theme.accentText : theme.muted, opacity: active ? 0.85 : 1 }}
                >
                  {opt.tier}
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onStart}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 cursor-pointer"
          style={{
            backgroundColor: theme.accent,
            color: theme.accentText,
          }}
        >
          게임 시작
        </button>
      </div>
    </div>
  );
}
