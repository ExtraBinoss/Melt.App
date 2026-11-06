import { resolveEffectSettings, type Effect } from "@musart/core";

/** One-sided authored displacement, independent of phase, tone, amount and raster density. */
export function meltFootprint(effect: Effect) {
  const settings = resolveEffectSettings(effect),
    distance = Number(settings.distance),
    angle = (Number(settings.angle) * Math.PI) / 180,
    x = Math.cos(angle) * distance,
    y = Math.sin(angle) * distance,
    margin = (value: number) => (value > 0.000001 ? Math.ceil(value) + 1 : 0);
  return {
    left: margin(-x),
    top: margin(-y),
    right: margin(x),
    bottom: margin(y),
  };
}
