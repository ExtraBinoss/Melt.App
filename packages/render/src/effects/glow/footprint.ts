import { resolveEffectSettings, type Effect } from "@musart/core";
/** Reserve authored halo support even at amount zero, keeping animated transports stable. */
export function glowFootprint(effect: Effect) {
  const radius = Math.ceil(Number(resolveEffectSettings(effect).radius)) + 1;
  return { left: radius, top: radius, right: radius, bottom: radius };
}
