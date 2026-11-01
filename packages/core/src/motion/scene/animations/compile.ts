import type { Composition } from "../../../document/model";
import { ensure } from "../../../errors";
import { compileAnimationChannel, type CompiledAnimationChannel } from "../../animations/compile";
import type { SceneMotionPropertyTarget } from "../model";
import { resolveSceneMotionProperty } from "../properties";
import { sceneAnimationTarget } from "./targets";
import type { SceneMotionAnimation } from "./model";
export function compileSceneAnimation(
  page: Composition,
  animation: SceneMotionAnimation,
): CompiledAnimationChannel<SceneMotionPropertyTarget>[] {
  if (!animation.enabled) return [];
  return animation.preset.channels.map((channel) => {
    const target = sceneAnimationTarget(animation.owner, channel.target);
    const descriptor = resolveSceneMotionProperty(page, target);
    ensure(descriptor, "INVALID_DOCUMENT", "Scene animation target is missing");
    return compileAnimationChannel(animation, channel, descriptor);
  });
}
export function compileSceneAnimations(
  page: Composition,
): CompiledAnimationChannel<SceneMotionPropertyTarget>[] {
  return (page.motion?.sceneAnimations ?? []).flatMap((animation) =>
    compileSceneAnimation(page, animation),
  );
}
