import type { Composition } from "../../../document/model";
import { ensure } from "../../../errors";
import {
  captureAnimationRecipe,
  propertyTimelineInterval,
  normalizedPropertyPoints,
} from "../../animations/preset-utils";
import { resolveSceneMotionProperty } from "../properties";
import type {
  SceneAnimationOwner,
  SceneMotionAnimation,
  SceneMotionAnimationPreset,
  SceneAnimationTarget,
} from "./model";
import { sceneAnimationOwner, sceneAnimationOwnerKey, sceneAnimationTarget } from "./targets";
import { validateSceneMotionAnimationPreset } from "./validation";
export function captureSceneMotionAnimationPreset(
  page: Composition,
  animation: SceneMotionAnimation,
  name: string,
  id: string,
  options: { bakeStrength?: boolean } = {},
): SceneMotionAnimationPreset {
  const preset = captureAnimationRecipe(
    animation,
    name,
    id,
    (channel) => {
      const descriptor = resolveSceneMotionProperty(
        page,
        sceneAnimationTarget(animation.owner, channel.target),
      );
      ensure(descriptor, "NOT_FOUND", "Scene animation owner is missing");
      return { value: descriptor.value, multiplier: 1 };
    },
    options,
  );
  validateSceneMotionAnimationPreset(preset);
  return preset;
}
export function extractSceneMotionAnimationPreset(
  page: Composition,
  owner: SceneAnimationOwner,
  name: string,
  id: string,
): SceneMotionAnimationPreset {
  const properties = (page.motion?.sceneProperties ?? []).filter(
    (property) =>
      property.keyframes.length >= 2 &&
      sceneAnimationOwnerKey(sceneAnimationOwner(property.target)) ===
        sceneAnimationOwnerKey(owner),
  );
  const { first, last } = propertyTimelineInterval(properties);
  const preset: SceneMotionAnimationPreset = {
    version: 1,
    id,
    name,
    category: "custom",
    duration: Math.max(1, Math.round((last - first) * 1000)),
    effects: [],
    channels: properties.map((property) => ({
      target: {
        kind: property.target.kind,
        property: property.target.property,
      } as SceneAnimationTarget,
      operation: "replace",
      points: normalizedPropertyPoints(property.keyframes, first, last),
    })),
  };
  validateSceneMotionAnimationPreset(preset);
  return preset;
}
