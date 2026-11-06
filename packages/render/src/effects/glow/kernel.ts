/** A finite Gaussian mixture retains a bright core and broad halo without a hard box edge. */
export const GLOW_SCALES = Object.freeze([
  { radius: 0.25, weight: 0.25 },
  { radius: 0.5, weight: 0.35 },
  { radius: 1, weight: 0.4 },
]);
const gaussian = (sigma: number) => {
  const weights = Array.from({ length: 9 }, (_, index) =>
      Math.exp(-0.5 * ((index - 4) / sigma) ** 2),
    ),
    sum = weights.reduce((total, value) => total + value, 0);
  return weights.map((value) => value / sum);
};
export const GLOW_PREFILTER_TAPS = Object.freeze(
  gaussian(1.6).map((weight, index) => Object.freeze({ offset: (index - 4) / 4, weight })),
);
const scales = GLOW_SCALES.map((scale) => ({
  weights: gaussian(1.6 * scale.radius),
  weight: scale.weight,
}));
export const GLOW_TAPS = Object.freeze(
  GLOW_PREFILTER_TAPS.map((tap, index) =>
    Object.freeze({
      offset: tap.offset,
      weight: scales.reduce((sum, scale) => sum + scale.weights[index]! * scale.weight, 0),
    }),
  ),
);

/** Every coarse tap overlaps an already softened footprint. Total support stays exactly radius. */
export const GLOW_PARTITIONS = Object.freeze([
  { start: 0, capacity: 4 },
  { start: 4, capacity: 12 },
  { start: 16, capacity: 48 },
  { start: 64, capacity: 192 },
]);
export function glowPartitionCount(radius: number) {
  return radius <= 4 ? 1 : radius <= 16 ? 2 : radius <= 64 ? 3 : 4;
}
