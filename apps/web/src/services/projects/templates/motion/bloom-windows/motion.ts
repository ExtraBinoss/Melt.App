export const BLOOM_WINDOWS_DURATION = 12;
export const BLOOM_WINDOW_CYCLE = BLOOM_WINDOWS_DURATION;
export const BLOOM_WINDOWS = [
  { id: "dither", label: "rose.dither", size: 400, ink: "#f6a6d4" },
  { id: "ascii", label: "petal.ascii", size: 400, ink: "#d9ff9a" },
  { id: "cyanotype", label: "bloom.blue", size: 340, ink: "#c5dcff" },
] as const;

/** Ordinary parent/counter rotations produce an exact circle without sampled position keys. */
export function bloomWindowPose(index: number) {
  const angle = (Math.PI * 2 * index) / 3;
  const offsetX = 240 * Math.cos(angle),
    offsetY = 240 * Math.sin(angle);
  return { offsetX, offsetY, centerX: 960 + offsetX, centerY: 540 + offsetY };
}
