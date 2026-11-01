import type { Node } from "three/webgpu";
import { abs, length, max, min } from "three/tsl";
/** Shared document-space signed distance for shape paint and media coverage. */
export function roundedRectangleDistance(
  position: Node<"vec2">,
  half: Node<"vec2">,
  radius: Node<"float">,
) {
  const q = abs(position).sub(half).add(radius);
  return length(max(q, 0))
    .add(min(max(q.x, q.y), 0))
    .sub(radius);
}
