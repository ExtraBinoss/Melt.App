export const BLOOM_WINDOWS_DURATION = 12;
export const BLOOM_WINDOW_CYCLE = 1.2;
export const BLOOM_WINDOWS = [
  { id: "dither", label: "Dither", size: 400 },
  { id: "ascii", label: "ASCII", size: 400 },
  { id: "cyanotype", label: "Cyanotype", size: 340 },
] as const;

/** Ordinary parent/counter rotations produce an exact circle without sampled position keys. */
export function bloomWindowPose(index: number) {
  const angle = (Math.PI * 2 * index) / 3;
  const offsetX = 240 * Math.cos(angle),
    offsetY = 240 * Math.sin(angle);
  return { offsetX, offsetY, centerX: 960 + offsetX, centerY: 540 + offsetY };
}
