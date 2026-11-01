import { resolveEffectSettings, type Effect } from "@musart/core";
import type { EffectStage } from "../shared/stages";
import { blurNode, blurVerticalNode } from "./node";
import { bilateralNode, boxHorizontalNode, boxVerticalNode, directionalNode } from "./kernels";
import { lensNode, spinNode, zoomNode } from "./radial";

const stages: Readonly<Record<string, readonly EffectStage[]>> = Object.freeze({
  gaussian: Object.freeze([
    { key: "blur:x", builder: blurNode, final: false },
    { key: "blur:y", builder: blurVerticalNode, final: true },
  ]),
  box: Object.freeze([
    { key: "blur:box:x", builder: boxHorizontalNode, final: false },
    { key: "blur:box:y", builder: boxVerticalNode, final: true },
  ]),
  directional: Object.freeze([{ key: "blur:directional", builder: directionalNode, final: true }]),
  spin: Object.freeze([{ key: "blur:spin", builder: spinNode, final: true }]),
  zoom: Object.freeze([{ key: "blur:zoom", builder: zoomNode, final: true }]),
  lens: Object.freeze([{ key: "blur:lens", builder: lensNode, final: true }]),
  bilateral: Object.freeze([{ key: "blur:bilateral", builder: bilateralNode, final: true }]),
});

/** A bounded set of algorithm-owned graphs, sharing the existing GPU pass/cache owner. */
export function blurStages(effect: Effect): readonly EffectStage[] {
  const technique = String(resolveEffectSettings(effect).technique);
  if (!Object.hasOwn(stages, technique)) throw new Error("Unknown blur technique.");
  return stages[technique]!;
}
