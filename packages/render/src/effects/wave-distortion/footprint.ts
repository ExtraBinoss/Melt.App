import { resolveEffectSettings, type Effect } from "@musart/core";

/** Displacement is perpendicular to propagation; phase/frequency never change its bound. */
export function waveDistortionFootprint(effect: Effect) {
  const s = resolveEffectSettings(effect),
    amplitude = Math.abs(Number(s.amplitude)),
    angle = (Number(s.angle) * Math.PI) / 180,
    margin = (projection: number) => (projection > 0.000001 ? Math.ceil(projection) + 1 : 0),
    x = margin(Math.abs(Math.sin(angle)) * amplitude),
    y = margin(Math.abs(Math.cos(angle)) * amplitude);
  return { left: x, right: x, top: y, bottom: y };
}
