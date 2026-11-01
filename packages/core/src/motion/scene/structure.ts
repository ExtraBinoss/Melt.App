import { canApplySceneMotionAnimationPreset } from "./animations/targets";
import type { Composition } from "../../document/model";
import { resolveSceneMotionProperty } from "./properties";
/** Light deletion and rig replacement prune only channels whose durable target disappeared. */
export function pruneSceneMotionProperties(page: Composition): void {
  if (!page.motion) return;
  if (page.motion.sceneAnimations) {
    const sceneAnimations = page.motion.sceneAnimations.filter((animation) =>
      canApplySceneMotionAnimationPreset(page, animation.owner, animation.preset),
    );
    if (sceneAnimations.length !== page.motion.sceneAnimations.length)
      page.motion = { ...page.motion, sceneAnimations };
  }
  if (!page.motion.sceneProperties) return;
  const sceneProperties = page.motion.sceneProperties.filter(({ target }) =>
    resolveSceneMotionProperty(page, target),
  );
  if (sceneProperties.length !== page.motion.sceneProperties.length)
    page.motion = { ...page.motion, sceneProperties };
}
