import { messages as glowNodeMessages } from "./library/glow/messages";
import { messages as neonMeltNodeMessages } from "./library/neon-melt/messages";
import { messages as repeaterNodeMessages } from "./library/repeater/messages";
import { messages as waveDistortionNodeMessages } from "./library/wave-distortion/messages";
import { messages as shapeGridNodeMessages } from "./library/shape-grid/messages";
import { messages as watercolorNodeMessages } from "./library/watercolor/messages";
import { messages as depthAnything } from "./library/depth-anything/messages";
import { messages as depthOfField } from "./library/depth-of-field/messages";
import { messages as trail } from "./library/trail/messages";
import { messages as risograph } from "./library/risograph/messages";
import { messages as oilPaint } from "./library/oil-paint/messages";
import { messages as blocks } from "./library/blocks/messages";
import { messages as chromaticAberration } from "./library/chromatic-aberration/messages";
import { messages as wind } from "./library/wind/messages";
import feather from "./library/feather/messages.json";
import { messages as halftone } from "./library/halftone/messages";
import { messages as liquify } from "./library/liquify/messages";
import { messages as tornEdges } from "./library/torn-edges/messages";
import { messages as terminal } from "./library/terminal/messages";
import inkBleed from "./library/ink-bleed/messages.json";
import pixelSort from "./library/pixel-sort/messages.json";
import edgeDetect from "./library/edge-detect/messages.json";
import { messages as windowTrails } from "./library/window-trails/messages";
import { messages as material } from "./library/material/messages";
import { messages as bevel } from "./library/bevel/messages";
import { messages as displace } from "./library/displace/messages";
import { messages as timeWarpScan } from "./library/time-warp-scan/messages";
import { messages as thermal } from "./library/thermal/messages";
import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
import { messages as ascii } from "./library/ascii/messages";
import { messages as shadow } from "./library/shadow/messages";
import { messages as morph } from "./library/morph/messages";
import { messages as ripple } from "./library/ripple/messages";
import { messages as blur } from "./library/blur/messages";
import { messages as shatter } from "./library/shatter/messages";
import { messages as noise } from "./library/noise/messages";

import { messages as flashlight } from "./library/flashlight/messages";
import { messages as circle } from "./library/circle/messages";
import { messages as cyanotype } from "./library/cyanotype/messages";
import { messages as crt } from "./library/crt/messages";
import { messages as datamosh } from "./library/datamosh/messages";
import { messages as bitDither } from "./library/bit-dither/messages";
import { messages as receipt } from "./library/receipt/messages";
import { messages as pinkPhosphor } from "./library/pink-phosphor/messages";
/** UI resources stay on the web side; the core catalog only contains stable label keys. */
export const libraryMessages = {
  glow: glowNodeMessages,
  "neon-melt": neonMeltNodeMessages,
  repeater: repeaterNodeMessages,
  "wave-distortion": waveDistortionNodeMessages,
  "shape-grid": shapeGridNodeMessages,
  watercolor: watercolorNodeMessages,

  "depth-anything": depthAnything,
  "depth-of-field": depthOfField,
  trail,
  risograph: risograph,
  "oil-paint": oilPaint,
  blocks: blocks,
  "chromatic-aberration": chromaticAberration,
  wind: wind,
  feather,
  terminal,
  halftone,
  liquify,
  "torn-edges": tornEdges,
  "ink-bleed": inkBleed,
  "pixel-sort": pixelSort,
  "edge-detect": edgeDetect,
  "window-trails": windowTrails,
  bevel,
  displace,
  thermal,
  "time-warp-scan": timeWarpScan,
  ascii,
  morph,
  shadow,
  ripple,
  blur,
  shatter,
  noise,
  flashlight,
  circle,
  cyanotype,
  crt,
  datamosh,
  "bit-dither": bitDither,
  receipt,
  "pink-phosphor": pinkPhosphor,
};
for (const [type, messages] of Object.entries(libraryMessages)) {
  registerFeatureTranslations(`${type}Fx`, messages);
}
const labels: Record<string, Record<string, string>> = {};
for (const [type, messages] of Object.entries(libraryMessages)) {
  for (const [language, resource] of Object.entries(messages))
    if (typeof resource.name === "string") (labels[language] ??= {})[type] = resource.name;
}
registerFeatureTranslations("translation", labels);

registerFeatureTranslations("materialFx", material);
