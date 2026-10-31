import type { MotionEasing } from "@musart/core";

export const BLOOM_WINDOWS_DURATION = 12;
export const BLOOM_WINDOW_CYCLE = 1.2;
export const BLOOM_WINDOWS = [
  { id: "dither", label: "Dither", size: 400 },
  { id: "ascii", label: "ASCII", size: 400 },
  { id: "cyanotype", label: "Cyanotype", size: 340 },
] as const;
const TAU = Math.PI * 2;

/** Hermite quarter-wave segments retain velocity at each point and across the 1.2 s seam. */
function incoming(angle: number, sine: boolean): MotionEasing {
  const step = TAU / 12;
  const f = sine ? Math.sin : Math.cos;
  const derivative = sine ? Math.cos : (value: number) => -Math.sin(value);
  const delta = f(angle) - f(angle - step);
  return {
    type: "cubicBezier",
    x1: 1 / 3,
    x2: 2 / 3,
    y1: (derivative(angle - step) * step) / (3 * delta),
    y2: 1 - (derivative(angle) * step) / (3 * delta),
  };
}

/** A fast repeating carousel over an independently timed, calm flower video. */
export function bloomWindowMotion(index: number) {
  const window = BLOOM_WINDOWS[index]!;
  return Array.from({ length: 121 }, (_, sample) => {
    const angle = TAU * ((sample % 12) / 12 + index / 3);
    const x = 960 + 330 * Math.cos(angle) - window.size / 2;
    const y = 540 + 165 * Math.sin(angle) - window.size / 2;
    return {
      time: sample / 10,
      x,
      y,
      videoX: -x,
      videoY: -y,
      easingX: incoming(angle, false),
      easingY: incoming(angle, true),
    };
  });
}
