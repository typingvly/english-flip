let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playTypeSound(volumePercent: number): void {
  const level = Math.max(0, Math.min(1, volumePercent / 100));
  if (level <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  // Subtle soft mechanical key click with tiny organic pitch variation
  const pitchJitter = 0.96 + Math.random() * 0.08;
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(310 * pitchJitter, now);
  osc.frequency.exponentialRampToValueAtTime(115 * pitchJitter, now + 0.032);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, now);

  const peakGain = 0.14 * level;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.04);
}

export function playFlipSound(volumePercent: number): void {
  const level = Math.max(0, Math.min(1, volumePercent / 100));
  if (level <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25]; // C5 -> E5 crisp minimal chime

  notes.forEach((freq, idx) => {
    const start = now + idx * 0.038;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.015, start + 0.09);

    const peakGain = (idx === 0 ? 0.13 : 0.16) * level;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peakGain, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + 0.12);
  });
}
