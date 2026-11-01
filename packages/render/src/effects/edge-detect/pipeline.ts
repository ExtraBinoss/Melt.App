import type { EffectStage } from "../shared/stages";
import { gaussianAxis } from "../blur/gaussian";
import { edgeDetectNode } from "./node";
export const EDGE_DETECT_STAGES: readonly EffectStage[] = Object.freeze([
  {
    key: "edge-detect:smooth-x",
    final: false,
    builder: (context) => gaussianAxis(context, "x", context.controls.parameters.smoothing!),
  },
  {
    key: "edge-detect:smooth-y",
    final: false,
    builder: (context) => gaussianAxis(context, "y", context.controls.parameters.smoothing!),
  },
  { key: "edge-detect:finish", final: true, builder: edgeDetectNode },
]);
