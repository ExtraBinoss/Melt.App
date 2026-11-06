import { depthAnythingNode } from "./depth-anything/node";
import { depthOfFieldNode } from "./depth-of-field/node";
import { trailNode } from "./trail/node";
import { risographNode } from "./risograph/node";
import { oilPaintNode } from "./oil-paint/node";
import { blocksNode } from "./blocks/node";
import { chromaticAberrationNode } from "./chromatic-aberration/node";
import { windNode } from "./wind/node";
import { featherNode } from "./feather/node";
import { liquifyNode } from "./liquify/node";
import { tornEdgesNode } from "./torn-edges/node";
import { terminalNode } from "./terminal/node";
import { inkBleedNode } from "./ink-bleed/node";
import { pixelSortFinishNode } from "./pixel-sort/node";
import { edgeDetectNode } from "./edge-detect/node";
import { windowTrailsNode } from "./window-trails/node";
import { bevelNode } from "./bevel/node";
import { displaceNode } from "./displace/node";
import { thermalNode } from "./thermal/node";
import type { EffectType } from "@musart/core";
import { asciiNode } from "./ascii/node";
import { blurNode } from "./blur/node";
import { shadowNode } from "./shadow/node";
import { brightnessNode } from "./brightness/node";
import { contrastNode } from "./contrast/node";
import { ditherNode } from "./dither/node";
import { grayscaleNode } from "./grayscale/node";
import type { EffectNodeBuilder } from "./shared/context";

import { exposureNode } from "./exposure/node";
import { saturationNode } from "./saturation/node";
import { hueNode } from "./hue/node";
import { vibranceNode } from "./vibrance/node";
import { temperatureNode } from "./temperature/node";
import { tintNode } from "./tint/node";
import { gammaNode } from "./gamma/node";
import { invertNode } from "./invert/node";
import { sepiaNode } from "./sepia/node";
import { thresholdNode } from "./threshold/node";
import { posterizeNode } from "./posterize/node";
import { grainNode } from "./grain/node";
import { halftoneNode } from "./halftone/node";
import { vignetteNode } from "./vignette/node";
import { rippleNode } from "./ripple/node";
import { shatterNode } from "./shatter/node";
import { noiseNode } from "./noise/node";
import { flashlightNode } from "./flashlight/node";
import { circleNode } from "./circle/node";
import { cyanotypeNode } from "./cyanotype/node";
import { crtNode } from "./crt/node";
import { datamoshNode } from "./datamosh/node";
import { bitDitherNode } from "./bit-dither/node";
import { receiptNode } from "./receipt/node";
import { pinkPhosphorNode } from "./pink-phosphor/node";
/** Renderer implementation registry. Metadata/defaults live in the pure core catalogue. */
export const EFFECT_NODES: Readonly<
  Record<
    Exclude<EffectType, "gradient" | "transition" | "morph" | "time-warp-scan">,
    EffectNodeBuilder
  >
> = Object.freeze({
  "depth-anything": depthAnythingNode,
  "depth-of-field": depthOfFieldNode,
  trail: trailNode,
  risograph: risographNode,
  "oil-paint": oilPaintNode,
  blocks: blocksNode,
  "chromatic-aberration": chromaticAberrationNode,
  wind: windNode,
  feather: featherNode,
  terminal: terminalNode,
  liquify: liquifyNode,
  "torn-edges": tornEdgesNode,
  "ink-bleed": inkBleedNode,
  "pixel-sort": pixelSortFinishNode,
  "edge-detect": edgeDetectNode,
  "window-trails": windowTrailsNode,
  bevel: bevelNode,
  displace: displaceNode,
  thermal: thermalNode,
  dither: ditherNode,
  ascii: asciiNode,
  brightness: brightnessNode,
  contrast: contrastNode,
  grayscale: grayscaleNode,
  blur: blurNode,
  shadow: shadowNode,
  exposure: exposureNode,
  saturation: saturationNode,
  hue: hueNode,
  vibrance: vibranceNode,
  temperature: temperatureNode,
  tint: tintNode,
  gamma: gammaNode,
  invert: invertNode,
  sepia: sepiaNode,
  threshold: thresholdNode,
  posterize: posterizeNode,
  grain: grainNode,
  halftone: halftoneNode,
  vignette: vignetteNode,
  ripple: rippleNode,
  shatter: shatterNode,
  noise: noiseNode,
  flashlight: flashlightNode,
  circle: circleNode,
  cyanotype: cyanotypeNode,
  datamosh: datamoshNode,
  crt: crtNode,
  "bit-dither": bitDitherNode,
  receipt: receiptNode,
  "pink-phosphor": pinkPhosphorNode,
});
