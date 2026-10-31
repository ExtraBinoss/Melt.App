import type { Composition } from "../../document/model";
import { ensure } from "../../errors";
import { compileMotionInterpolator } from "../interpolation";
import type { CompiledMotionProperty } from "../compile";
import type { SceneMotionPropertyTarget } from "./model";
import { resolveSceneMotionProperty } from "./properties";
export interface CompiledSceneMotionProperty extends Omit<CompiledMotionProperty, "target"> {
  readonly target: SceneMotionPropertyTarget;
}
export function compileSceneMotion(page: Composition): CompiledSceneMotionProperty[] {
  return (page.motion?.sceneProperties ?? [])
    .filter((property) => property.keyframes.length > 0)
    .map((property) => {
      const descriptor = resolveSceneMotionProperty(page, property.target);
      ensure(descriptor, "INVALID_DOCUMENT", "Unknown scene Motion property");
      return {
        target: descriptor.target,
        keys: property.keyframes.map((key) => ({ time: key.time, value: key.value })),
        segments: property.keyframes
          .slice(1)
          .map((key, index) =>
            compileMotionInterpolator(
              descriptor,
              property.keyframes[index]!.value,
              key.value,
              key.easing,
            ),
          ),
      };
    });
}
