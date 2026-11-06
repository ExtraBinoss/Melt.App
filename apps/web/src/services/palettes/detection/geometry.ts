import { IDENTITY, layerTransform, multiplyMatrices, transformPoint } from "@musart/core";
import type { Composition, Layer, Matrix, Point } from "@musart/core";

/** Clip the transformed rectangular source footprint to the active artboard. */
export function footprintArea(layer: Layer, matrix: Matrix, page: Composition): number {
  let points = [
    [0, 0],
    [layer.width, 0],
    [layer.width, layer.height],
    [0, layer.height],
  ].map(([x, y]) => transformPoint(matrix, { x: x!, y: y! }));
  for (const [axis, edge, sign] of [
    ["x", 0, 1],
    ["x", page.width, -1],
    ["y", 0, 1],
    ["y", page.height, -1],
  ] as const) {
    const output: Point[] = [];
    for (let at = 0; at < points.length; at++) {
      const from = points[at]!,
        to = points[(at + 1) % points.length]!;
      const insideFrom = (from[axis] - edge) * sign >= 0;
      const insideTo = (to[axis] - edge) * sign >= 0;
      if (insideFrom) output.push(from);
      if (insideFrom !== insideTo) {
        const t = (edge - from[axis]) / (to[axis] - from[axis]);
        output.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      }
    }
    points = output;
  }
  return (
    Math.abs(
      points.reduce((area, from, at) => {
        const to = points[(at + 1) % points.length]!;
        return area + from.x * to.y - from.y * to.x;
      }, 0),
    ) / 2
  );
}

export function layerVisibility(page: Composition) {
  const byId = new Map(page.layers.map((layer) => [layer.id, layer]));
  const maskSources = new Set(
    page.layers.flatMap((layer) =>
      layer.mask?.enabled && layer.mask.layerId ? [layer.mask.layerId] : [],
    ),
  );
  const cache = new Map<string, { opacity: number; matrix: Matrix }>();
  const visiting = new Set<string>();
  function resolve(layer: Layer): { opacity: number; matrix: Matrix } {
    const cached = cache.get(layer.id);
    if (cached) return cached;
    if (visiting.has(layer.id)) return { opacity: 0, matrix: IDENTITY };
    visiting.add(layer.id);
    const parent = layer.parentId ? byId.get(layer.parentId) : undefined;
    const inherited = parent ? resolve(parent) : { opacity: 1, matrix: IDENTITY };
    const value = {
      opacity:
        layer.visible && !layer.maskSource && !maskSources.has(layer.id) && !layer.spatialContext
          ? inherited.opacity * layer.opacity
          : 0,
      matrix: multiplyMatrices(inherited.matrix, layerTransform(layer)),
    };
    visiting.delete(layer.id);
    cache.set(layer.id, value);
    return value;
  }
  return resolve;
}
