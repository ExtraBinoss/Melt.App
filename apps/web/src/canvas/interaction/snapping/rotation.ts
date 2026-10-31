import {
  createLayerGeometryIndex,
  IDENTITY,
  layerTransform,
  multiplyMatrices,
  transformPoint,
  type Composition,
  type Layer,
  type Point,
} from "@musart/core";
export interface RotationGuide {
  center: Point;
  from: Point;
  to: Point;
  label: Point;
  angle: number;
}
/** Follow the constrained rotation grip in world space, including transformed parents. */
export function rotationGuide(
  page: Composition,
  layer: Layer,
  rotation: number,
  zoom: number,
): RotationGuide {
  const geometry = createLayerGeometryIndex(page),
    parent = layer.parentId ? geometry.worldMatrix(layer.parentId) : IDENTITY,
    matrix = multiplyMatrices(parent, layerTransform({ ...layer, rotation }));
  const center = transformPoint(matrix, { x: layer.width / 2, y: layer.height / 2 }),
    grip = transformPoint(matrix, { x: layer.width / 2, y: -19 });
  const length = Math.max(1e-8, Math.hypot(grip.x - center.x, grip.y - center.y)),
    unit = { x: (grip.x - center.x) / length, y: (grip.y - center.y) / length };
  return {
    center,
    from: { x: center.x - unit.x * length * 0.55, y: center.y - unit.y * length * 0.55 },
    to: { x: grip.x + (unit.x * 16) / zoom, y: grip.y + (unit.y * 16) / zoom },
    label: { x: grip.x + (unit.x * 34) / zoom, y: grip.y + (unit.y * 34) / zoom },
    angle: ((rotation % 360) + 360) % 360,
  };
}
