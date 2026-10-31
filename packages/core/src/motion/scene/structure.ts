import type { Composition } from "../../document/model";
import { resolveSceneMotionProperty } from "./properties";
/** Light deletion and rig replacement prune only channels whose durable target disappeared. */
export function pruneSceneMotionProperties(page: Composition): void {
  if (!page.motion?.sceneProperties) return;
  const sceneProperties = page.motion.sceneProperties.filter(({ target }) =>
    resolveSceneMotionProperty(page, target),
  );
  if (sceneProperties.length !== page.motion.sceneProperties.length)
    page.motion = { ...page.motion, sceneProperties };
}
