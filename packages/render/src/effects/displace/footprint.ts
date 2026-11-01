import { resolveEffectSettings, type Effect } from "@musart/core";
/** Reserve the whole map range independently of amount animation. */
export function displaceFootprint(effect: Effect) {
  const s = resolveEffectSettings(effect);
  const range =
    Math.max(Number(s.midpoint), 1 - Number(s.midpoint)) *
    Number(s.contrast) *
    (1 + Number(s.dispersion) * 0.2);
  const x = s.preserveAlpha ? 0 : Math.ceil(Math.abs(Number(s.strengthX)) * range) + 1;
  const y = s.preserveAlpha ? 0 : Math.ceil(Math.abs(Number(s.strengthY)) * range) + 1;
  return { left: x, right: x, top: y, bottom: y };
}
