import { ThemeConfig } from '../types/game';

interface TimeBarProps {
  visible: boolean;
  progress: number;
  theme: ThemeConfig;
}

export function TimeBar({ visible, progress, theme }: TimeBarProps) {
  if (!visible) return null;

  const clamped = Math.max(0, Math.min(1, progress));
  const [c0, c1, c2, c3] = theme.barColors;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 h-[5px] pointer-events-none overflow-hidden"
      style={{ backgroundColor: theme.surface }}
      aria-hidden="true"
    >
      <div
        className="h-full w-full origin-left animate-bar-flow"
        style={{
          transform: `scaleX(${clamped})`,
          transition: 'transform 100ms linear',
          backgroundImage: `linear-gradient(90deg, ${c0}, ${c1}, ${c2}, ${c3}, ${c0})`,
        }}
      />
    </div>
  );
}
