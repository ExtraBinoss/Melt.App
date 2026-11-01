import type { VectorDefinition } from "@musart/core";
import type { ShapePath } from "three/webgpu";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
const maxBatchParts = 256;
const maxBatchCharacters = 256 * 1024;

/** Bounded transient XML batches; Three still parses every path command unchanged. */
export function* parseVectorPaths(
  vector: VectorDefinition,
): Generator<{ path: ShapePath; partIndex: number }> {
  const parts = vector.parts ?? [{ path: vector.path ?? "" }];
  for (let start = 0; start < parts.length;) {
    const nodes: string[] = [];
    let end = start,
      characters = 0;
    while (end < parts.length && end - start < maxBatchParts) {
      const part = parts[end]!;
      // Keep one large authored path intact, but don't combine it with other parts.
      if (end > start && characters + part.path.length > maxBatchCharacters) break;
      nodes.push(
        `<path data-part="${end}" d="${escapeAttribute(part.path)}" fill-rule="${part.fillRule ?? "nonzero"}"/>`,
      );
      characters += part.path.length;
      end++;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttribute(vector.viewBox)}">${nodes.join("")}</svg>`;
    for (const path of new SVGLoader().parse(svg).paths) {
      // Empty d/none paths are omitted by SVGLoader: output position is not a part ID.
      const partIndex = Number((path.userData.node as Element).getAttribute("data-part"));
      yield { path, partIndex };
    }
    start = end;
  }
}
