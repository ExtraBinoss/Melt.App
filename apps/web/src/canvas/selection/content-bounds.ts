import {
  morphContentBounds,
  transformPoint,
  type LayerGeometryIndex,
  type Layer,
} from "@musart/core";

/** Transform source ink bounds through the hierarchy, leaving resize frames untouched. */
export function selectionContentBounds(index: LayerGeometryIndex, layer: Layer) {
  const local = morphContentBounds(layer);
  if (!local) return index.worldBounds(layer.id);
  const matrix = index.worldMatrix(layer.id);
  const corners = [
    { x: local.x, y: local.y },
    { x: local.x + local.width, y: local.y },
    { x: local.x + local.width, y: local.y + local.height },
    { x: local.x, y: local.y + local.height },
  ].map((point) => transformPoint(matrix, point));
  const x = Math.min(...corners.map((point) => point.x)),
    y = Math.min(...corners.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...corners.map((point) => point.x)) - x,
    height: Math.max(...corners.map((point) => point.y)) - y,
  };
}
