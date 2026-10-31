import { cloneValue } from "../../document/immutable";
import type { VectorSubpath } from "./model";
import type { VectorCorner } from "../model";
import { roundVectorNode } from "./nodes";
import { writeVectorPath } from "./path";
/** Source nodes and desired radii stay editable; the ordinary SVG path remains the rendered result. */
export function writeRoundedVectorPath(
  paths: readonly VectorSubpath[],
  corners: readonly VectorCorner[],
): string {
  if (!corners.length) return writeVectorPath(paths);
  const result = cloneValue(paths) as VectorSubpath[];
  for (const corner of [...corners].sort((a, b) => a.contour - b.contour || b.node - a.node)) {
    const path = result[corner.contour];
    if (path && path.nodes[corner.node]) roundVectorNode(path, corner.node, corner.radius);
  }
  return writeVectorPath(result);
}
