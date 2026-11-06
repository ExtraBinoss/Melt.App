import { GLOW_DEFINITION } from "./glow/definition";
import { NEON_MELT_DEFINITION } from "./neon-melt/definition";
import { REPEATER_DEFINITION } from "./repeater/definition";
import { WAVE_DISTORTION_DEFINITION } from "./wave-distortion/definition";
import { SHAPE_GRID_DEFINITION } from "./shape-grid/definition";
import { WATERCOLOR_DEFINITION } from "./watercolor/definition";
import { DEPTH_ANYTHING_DEFINITION } from "./depth-anything/definition";
import { DEPTH_OF_FIELD_DEFINITION } from "./depth-of-field/definition";
import { TRAIL_DEFINITION } from "./trail/definition";
import { RISOGRAPH_DEFINITION } from "./risograph/definition";
import { OIL_PAINT_DEFINITION } from "./oil-paint/definition";
import { BLOCKS_DEFINITION } from "./blocks/definition";
import { CHROMATIC_ABERRATION_DEFINITION } from "./chromatic-aberration/definition";
import { WIND_DEFINITION } from "./wind/definition";
import { withEffectSdk } from "./sdk/domain";
import { FEATHER_DEFINITION } from "./feather/definition";
import { HALFTONE_DEFINITION } from "./halftone/definition";
import { TORN_EDGES_DEFINITION } from "./torn-edges/definition";
import { LIQUIFY_DEFINITION } from "./liquify/definition";
import { TERMINAL_DEFINITION } from "./terminal/definition";
import { INK_BLEED_DEFINITION } from "./ink-bleed/definition";
import { PIXEL_SORT_DEFINITION } from "./pixel-sort/definition";
import { EDGE_DETECT_DEFINITION } from "./edge-detect/definition";
import { WINDOW_TRAILS_DEFINITION } from "./window-trails/definition";
import { TIME_WARP_SCAN_DEFINITION } from "./retired/time-warp-scan";
import { BEVEL_DEFINITION } from "./bevel/definition";
import { DISPLACE_DEFINITION } from "./displace/definition";
import { THERMAL_DEFINITION } from "./thermal/definition";
import { ensure } from "../errors";
import type { EffectType } from "../document/model";

export type {
  NumberEffectParameter,
  BooleanEffectParameter,
  ChoiceEffectParameter,
  ColorEffectParameter,
  TextEffectParameter,
  EffectParameter,
  EffectDefinition,
} from "./definition";
import { defineEffect, AMOUNT, SCALE, LEVELS, COLOR, SEED } from "./definition";
import type { EffectDefinition } from "./definition";
import { GRADIENT_DEFINITION } from "./gradient/definition";
import { RIPPLE_DEFINITION } from "./ripple/definition";
import { SHATTER_DEFINITION } from "./shatter/definition";
import { FLASHLIGHT_DEFINITION } from "./flashlight/definition";
import { NOISE_DEFINITION } from "./noise/definition";
import { CIRCLE_DEFINITION } from "./circle/definition";
import { CYANOTYPE_DEFINITION } from "./cyanotype/definition";
import { CRT_DEFINITION } from "./crt/definition";
import { DATAMOSH_DEFINITION } from "./datamosh/definition";
import { BIT_DITHER_DEFINITION } from "./bit-dither/definition";
import { RECEIPT_DEFINITION } from "./receipt/definition";
import { PINK_PHOSPHOR_DEFINITION } from "./pink-phosphor/definition";
import { TRANSITION_DEFINITION } from "./transition/definition";
import { BLUR_DEFINITION } from "./blur/definition";
import { SHADOW_DEFINITION } from "./shadow/definition";
import { MORPH_DEFINITION } from "./morph/definition";
import { ASCII_DEFINITION } from "./ascii/definition";
import { DITHER_DEFINITION } from "./dither/definition";
/** Portable effect metadata shared by factories, validation and client controls. */
const BUILTIN_EFFECTS: Readonly<Record<EffectType, EffectDefinition>> = Object.freeze({
  glow: GLOW_DEFINITION,
  "neon-melt": NEON_MELT_DEFINITION,
  repeater: REPEATER_DEFINITION,
  "wave-distortion": WAVE_DISTORTION_DEFINITION,
  "shape-grid": SHAPE_GRID_DEFINITION,
  watercolor: WATERCOLOR_DEFINITION,
  "depth-anything": DEPTH_ANYTHING_DEFINITION,
  "depth-of-field": DEPTH_OF_FIELD_DEFINITION,
  trail: TRAIL_DEFINITION,
  risograph: RISOGRAPH_DEFINITION,
  "oil-paint": OIL_PAINT_DEFINITION,
  blocks: BLOCKS_DEFINITION,
  "chromatic-aberration": CHROMATIC_ABERRATION_DEFINITION,
  wind: WIND_DEFINITION,
  feather: FEATHER_DEFINITION,
  terminal: TERMINAL_DEFINITION,
  "torn-edges": TORN_EDGES_DEFINITION,
  liquify: LIQUIFY_DEFINITION,
  "ink-bleed": INK_BLEED_DEFINITION,
  "pixel-sort": PIXEL_SORT_DEFINITION,
  "edge-detect": EDGE_DETECT_DEFINITION,
  "window-trails": WINDOW_TRAILS_DEFINITION,
  bevel: BEVEL_DEFINITION,
  displace: DISPLACE_DEFINITION,
  thermal: THERMAL_DEFINITION,
  "time-warp-scan": TIME_WARP_SCAN_DEFINITION,
  morph: MORPH_DEFINITION,
  dither: DITHER_DEFINITION,
  ascii: ASCII_DEFINITION,
  brightness: defineEffect("brightness", { amount: 0.5 }, [AMOUNT], "adjustment"),
  contrast: defineEffect("contrast", { amount: 0.5 }, [AMOUNT], "adjustment"),
  grayscale: defineEffect("grayscale", {}, [AMOUNT], "adjustment"),
  blur: BLUR_DEFINITION,
  shadow: SHADOW_DEFINITION,
  saturation: defineEffect("saturation", { amount: 0.5 }, [AMOUNT], "adjustment"),
  hue: defineEffect("hue", { amount: 0.5 }, [AMOUNT], "adjustment"),
  exposure: defineEffect("exposure", { amount: 0.5 }, [AMOUNT], "adjustment"),
  vibrance: defineEffect("vibrance", { amount: 0.5 }, [AMOUNT], "adjustment"),
  temperature: defineEffect("temperature", { amount: 0.5 }, [AMOUNT], "adjustment"),
  tint: defineEffect("tint", { amount: 0.5 }, [AMOUNT], "adjustment"),
  gamma: defineEffect("gamma", { amount: 0.5 }, [AMOUNT], "adjustment"),
  invert: defineEffect("invert", {}, [AMOUNT], "adjustment"),
  sepia: defineEffect("sepia", {}, [AMOUNT], "adjustment"),
  threshold: defineEffect("threshold", { amount: 0.5 }, [AMOUNT], "adjustment"),
  posterize: defineEffect("posterize", { levels: 6 }, [AMOUNT, LEVELS], "adjustment"),
  grain: defineEffect("grain", { amount: 0.2, scale: 1 }, [AMOUNT, SCALE, COLOR, SEED]),
  halftone: HALFTONE_DEFINITION,
  vignette: defineEffect("vignette", { amount: 0.5, scale: 2 }, [
    AMOUNT,
    { ...SCALE, labelKey: "effectControls:falloff", unit: "×" },
  ]),
  gradient: GRADIENT_DEFINITION,
  ripple: RIPPLE_DEFINITION,
  shatter: SHATTER_DEFINITION,
  noise: NOISE_DEFINITION,
  flashlight: FLASHLIGHT_DEFINITION,
  circle: CIRCLE_DEFINITION,
  cyanotype: CYANOTYPE_DEFINITION,
  datamosh: DATAMOSH_DEFINITION,
  crt: CRT_DEFINITION,
  "bit-dither": BIT_DITHER_DEFINITION,
  receipt: RECEIPT_DEFINITION,
  "pink-phosphor": PINK_PHOSPHOR_DEFINITION,
  transition: TRANSITION_DEFINITION,
});

/** Every built-in consumes the same authoring, validation and placement contract. */
export const EFFECT_CATALOG = Object.freeze(
  Object.fromEntries(
    Object.entries(BUILTIN_EFFECTS).map(([type, definition]) => [type, withEffectSdk(definition)]),
  ),
) as Readonly<Record<EffectType, EffectDefinition>>;

export function getEffectDefinition(type: EffectType): EffectDefinition {
  ensure(Object.hasOwn(EFFECT_CATALOG, type), "INVALID_COMMAND", "Effet inconnu");
  return EFFECT_CATALOG[type];
}
