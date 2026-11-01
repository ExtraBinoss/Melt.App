import { correspondingIndicesSteps } from "@musart/path-morph";
import type { MorphShapeFrame } from "@musart/core";
/** Remove only geometrically redundant trajectories, after winding/hole correspondence.
 * The 1e-10 normalized error is below float32 atlas precision. All authored poses remain.
 */
export function* compactPreparedMorph(frames: MorphShapeFrame[]): Generator<void> {
  for (let contour = 0; contour < frames[0]!.contours.length; contour++) {
    const states = frames.map((frame) => Float64Array.from(frame.contours[contour]!.points.flat()));
    const steps = correspondingIndicesSteps(states);
    let result = steps.next();
    while (!result.done) {
      yield;
      result = steps.next();
    }
    const indices = result.value;
    for (const frame of frames) {
      const source = frame.contours[contour]!;
      frame.contours[contour] = {
        ...source,
        points: Array.from(indices, (index) => source.points[index]!),
      };
    }
    yield;
  }
}
