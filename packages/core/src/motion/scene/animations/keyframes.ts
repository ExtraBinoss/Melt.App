import type { Composition } from "../../../document/model";
import {
  animationPointId,
  animationPointTime,
  animationPropertyId,
} from "../../animations/point-edit";
import type { SceneMotionPropertyTrack } from "../model";
import type { SceneAnimationOwner, SceneMotionAnimation } from "./model";
import { sceneAnimationOwner, sceneAnimationOwnerKey, sceneAnimationTarget } from "./targets";
export function projectSceneMotionAnimations(
  page: Composition,
  owner: SceneAnimationOwner,
): SceneMotionAnimation[] {
  return (page.motion?.sceneAnimations ?? []).filter(
    (animation) => sceneAnimationOwnerKey(animation.owner) === sceneAnimationOwnerKey(owner),
  );
}
export function projectSceneAnimationProperties(page: Composition, owner: SceneAnimationOwner) {
  return projectSceneMotionAnimations(page, owner).flatMap((animation) =>
    animation.preset.channels.map((channel, channelIndex) => ({
      animation,
      channelIndex,
      property: {
        id: animationPropertyId(animation.id, channelIndex),
        target: sceneAnimationTarget(animation.owner, channel.target),
        keyframes: channel.points.map((point, index) => ({
          id: animationPointId(animation.id, channelIndex, index),
          time: animationPointTime(animation, point.at),
          value: point.value,
          ...(point.easing ? { easing: point.easing } : {}),
        })),
      } satisfies SceneMotionPropertyTrack,
    })),
  );
}
export function projectSceneMotionProperties(
  page: Composition,
  owner: SceneAnimationOwner,
): SceneMotionPropertyTrack[] {
  return [
    ...(page.motion?.sceneProperties ?? []).filter(
      ({ target }) =>
        sceneAnimationOwnerKey(sceneAnimationOwner(target)) === sceneAnimationOwnerKey(owner),
    ),
    ...projectSceneAnimationProperties(page, owner).map(({ property }) => property),
  ];
}
