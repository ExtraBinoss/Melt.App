import type { Node } from "three/webgpu";
import { float, max, mix, sqrt, step } from "three/tsl";

/** A circular cap profile produces a pillow; a parabolic ridge isolates the outline.
 * Apply after height smoothing so even opaque alpha silhouettes develop a rounded rim. */
export function embossProfile(height: Node<"float">, mode: Node<"float">) {
  const raised = height,
    recessed = height.negate(),
    pillow = sqrt(max(0, height.mul(float(2).sub(height)))),
    outline = height.mul(height.oneMinus()).mul(4);
  return mix(
    mix(raised, recessed, step(0.5, mode)),
    mix(pillow, outline, step(2.5, mode)),
    step(1.5, mode),
  );
}

/** Recessed regions receive a shallow ambient cavity term in addition to reversed normals. */
export function embossCavity(height: Node<"float">, mode: Node<"float">) {
  return height.mul(step(0.5, mode)).mul(float(1).sub(step(1.5, mode)));
}
