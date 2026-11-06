import { resolveEffectSettings, type Effect } from "@musart/core";
export function neonMeltFootprint(effect: Effect) {
  const settings = resolveEffectSettings(effect),
    // Rotation can project both bounded flow components onto either authored axis.
    radius = Math.ceil(Number(settings.radius) + Math.SQRT2 * Number(settings.distortion)) + 2;
  return { left: radius, top: radius, right: radius, bottom: radius };
}
