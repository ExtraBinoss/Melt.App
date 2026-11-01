import { resolveEffectSettings, type Effect } from "@musart/core";
export function inkBleedFootprint(effect: Effect) {
  const radius = Math.ceil(Number(resolveEffectSettings(effect).radius)) + 1;
  return { left: radius, right: radius, top: radius, bottom: radius };
}
