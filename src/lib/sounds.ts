export type TodoCompleteSound =
  | 'soft'
  | 'softShort'
  | 'chime'
  | 'sparkle'
  | 'ding'
  | 'pop'
  | 'none';

const getAudioContext = () => {
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  return AudioContextCtor ? new AudioContextCtor() : null;
};

const playTone = (
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  peak: number,
  type: OscillatorType
) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
};

export const playTodoCompleteSound = (kind: TodoCompleteSound) => {
  if (kind === 'none') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    let endTime = now + 0.4;

    if (kind === 'soft') {
      playTone(ctx, 523.25, now, 0.2, 0.25, 'sine');
      playTone(ctx, 659.25, now + 0.06, 0.24, 0.22, 'sine');
      endTime = now + 0.35;
    } else if (kind === 'softShort') {
      playTone(ctx, 587.33, now, 0.14, 0.2, 'sine');
      playTone(ctx, 698.46, now + 0.05, 0.12, 0.18, 'sine');
      endTime = now + 0.22;
    } else if (kind === 'chime') {
      playTone(ctx, 523.25, now, 0.28, 0.28, 'triangle');
      playTone(ctx, 783.99, now + 0.06, 0.32, 0.22, 'triangle');
      playTone(ctx, 1046.5, now + 0.12, 0.36, 0.18, 'triangle');
      endTime = now + 0.5;
    } else if (kind === 'sparkle') {
      playTone(ctx, 880, now, 0.12, 0.2, 'sine');
      playTone(ctx, 1174.66, now + 0.05, 0.12, 0.18, 'sine');
      playTone(ctx, 1567.98, now + 0.1, 0.16, 0.16, 'sine');
      endTime = now + 0.3;
    } else if (kind === 'pop') {
      playTone(ctx, 660, now, 0.12, 0.35, 'square');
      endTime = now + 0.18;
    } else {
      playTone(ctx, 880, now, 0.45, 0.6, 'triangle');
      endTime = now + 0.5;
    }

    window.setTimeout(() => {
      ctx.close();
    }, Math.max(0, (endTime - now) * 1000 + 50));
  } catch {
    // ignore audio errors
  }
};
