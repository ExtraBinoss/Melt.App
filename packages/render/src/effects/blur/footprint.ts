import type { Effect } from "@musart/core";
export function blurFootprint(effect: Effect) {
  // All kernels fit inside this legacy Gaussian support: box/line ±√3σ,
  // lens ≤2σ, bilateral ±3σ and capped spin/zoom ≤√3σ per axis.
  // Reserve full scale through amount animation to avoid per-frame target reallocations.
  const margin = Math.ceil(effect.scale * 3.2) + 1;
  return { left: margin, top: margin, right: margin, bottom: margin };
}
