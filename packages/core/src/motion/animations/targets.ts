import { sceneMotionAddress } from "../scene/properties";
import type { SceneMotionPropertyTarget } from "../scene/model";
import type { MotionAnimation, AnimationTarget } from "./model";
import type { MotionPropertyTarget } from "../properties/model";

export function animationTarget(
  layerId: string,
  animation: Pick<MotionAnimation, "effectIds">,
  target: AnimationTarget,
): MotionPropertyTarget {
  if (target.kind === "layer") return { ...target, layerId };
  const { slot, ...property } = target;
  return { ...property, layerId, effectId: animation.effectIds[slot]! };
}

export function animationAddress(target: MotionPropertyTarget | SceneMotionPropertyTarget): string {
  if ("compositionId" in target) return sceneMotionAddress(target);
  return JSON.stringify([
    target.kind,
    target.layerId,
    target.kind === "layer" ? "" : target.effectId,
    target.property,
  ]);
}
