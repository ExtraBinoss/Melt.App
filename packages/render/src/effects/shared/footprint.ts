import { meltFootprint } from "../melt/footprint";
import { repeaterFootprint } from "../repeater/footprint";
import { waveDistortionFootprint } from "../wave-distortion/footprint";
import { glowFootprint } from "../glow/footprint";
import { neonMeltFootprint } from "../neon-melt/footprint";
import { inkBleedFootprint } from "../ink-bleed/footprint";
import type { Effect, EffectType } from "@musart/core";
import { displaceFootprint } from "../displace/footprint";
import { blurFootprint } from "../blur/footprint";
import { shadowFootprint } from "../shadow/footprint";
interface Outset {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface Dimensions {
  width: number;
  height: number;
}
type FootprintBuilder = (
  effect: Effect,
  dimensions: Dimensions | undefined,
  input: Outset,
) => Outset;
const footprints: Partial<Record<EffectType, FootprintBuilder>> = {
  melt: meltFootprint,
  repeater: (effect, dimensions, input) => {
    if (!dimensions) throw new Error("Repeater footprint requires authored owner dimensions.");
    return repeaterFootprint(effect, dimensions, input);
  },
  "wave-distortion": waveDistortionFootprint,
  glow: glowFootprint,
  "neon-melt": neonMeltFootprint,
  "ink-bleed": inkBleedFootprint,
  blur: blurFootprint,
  displace: displaceFootprint,
  shadow: shadowFootprint,
};
/** Conservatively admit the whole stack once; all intermediate pixels remain on the GPU. */
export function effectFootprint(effects: readonly Effect[], dimensions?: Dimensions): Outset {
  const result = { left: 0, top: 0, right: 0, bottom: 0 };
  for (const effect of effects) {
    const bounds = effect.enabled
      ? footprints[effect.type]?.(effect, dimensions, result)
      : undefined;
    if (bounds)
      for (const side of ["left", "top", "right", "bottom"] as const) result[side] += bounds[side];
  }
  return result;
}
