import type { Composition } from "../../../document/model";
import { ensure } from "../../../errors";
import type { SceneMotionPropertyTarget } from "../model";
import { resolveSceneMotionProperty } from "../properties";
import type {
  SceneAnimationOwner,
  SceneAnimationTarget,
  SceneMotionAnimationPreset,
} from "./model";
export function sceneAnimationOwner(target: SceneMotionPropertyTarget): SceneAnimationOwner {
  return target.kind === "light"
    ? { kind: "light", compositionId: target.compositionId, lightId: target.lightId }
    : { kind: target.kind, compositionId: target.compositionId };
}
export function sceneAnimationOwnerKey(owner: SceneAnimationOwner): string {
  return JSON.stringify([
    owner.kind,
    owner.compositionId,
    owner.kind === "light" ? owner.lightId : null,
  ]);
}
export function sceneAnimationTarget(
  owner: SceneAnimationOwner,
  target: SceneAnimationTarget,
): SceneMotionPropertyTarget {
  ensure(
    owner.kind === target.kind,
    "INVALID_COMMAND",
    "Animation channel does not match scene owner",
  );
  if (owner.kind === "light" && target.kind === "light")
    return { ...owner, property: target.property };
  if (owner.kind === "camera" && target.kind === "camera")
    return { ...owner, property: target.property };
  if (owner.kind === "environment" && target.kind === "environment")
    return { ...owner, property: target.property };
  ensure(false, "INVALID_COMMAND", "Unknown scene animation owner");
}
export function canApplySceneMotionAnimationPreset(
  page: Composition,
  owner: SceneAnimationOwner,
  preset: SceneMotionAnimationPreset,
): boolean {
  return (
    owner.compositionId === page.id &&
    preset.effects.length === 0 &&
    preset.channels.length > 0 &&
    preset.channels.every(
      (channel) =>
        channel.target.kind === owner.kind &&
        resolveSceneMotionProperty(page, sceneAnimationTarget(owner, channel.target)),
    )
  );
}
