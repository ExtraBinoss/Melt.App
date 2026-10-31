import {
  invertMatrix,
  transformPoint,
  type Bounds,
  type Composition,
  type Layer,
  SpatialGeometry,
} from "@musart/core";
import { Box3, Matrix4, Vector3, type Camera, type Object3D } from "three/webgpu";
/** Clip-space mapping of a source-local transport rectangle into the composition gate. */
export function transportProjection(
  page: Composition,
  layer: Layer,
  bounds: Bounds,
  geometry: SpatialGeometry,
) {
  const [a, b, c, d, e, f] = geometry.layoutMatrix(layer.id),
    w = bounds.width,
    h = bounds.height,
    x = e + a * bounds.x + c * bounds.y,
    y = f + b * bounds.x + d * bounds.y,
    pw = page.width,
    ph = page.height;
  return new Matrix4().set(
    (a * w) / pw,
    (-c * h) / pw,
    0,
    (a * w + c * h + 2 * x) / pw - 1,
    (-b * w) / ph,
    (d * h) / ph,
    0,
    1 - (b * w + d * h + 2 * y) / ph,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
  );
}
export function projectedTransport(
  page: Composition,
  layer: Layer,
  root: Object3D,
  camera: Camera,
  geometry: SpatialGeometry,
): Bounds {
  const inverse = invertMatrix(geometry.layoutMatrix(layer.id));
  const box = new Box3().setFromObject(root),
    points: { x: number; y: number }[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const view = new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        // A box crossing the near plane can project beyond every corner: use the full gate.
        if (view.z >= -0.01 || box.isEmpty()) return gate();
        const p = new Vector3(x, y, z).project(camera);
        points.push(
          transformPoint(inverse, {
            x: ((p.x + 1) * page.width) / 2,
            y: ((1 - p.y) * page.height) / 2,
          }),
        );
      }
  const visible = gate(),
    pad = 2;
  const x = Math.max(visible.x, Math.floor(Math.min(...points.map((p) => p.x))) - pad),
    y = Math.max(visible.y, Math.floor(Math.min(...points.map((p) => p.y))) - pad),
    right = Math.min(
      visible.x + visible.width,
      Math.ceil(Math.max(...points.map((p) => p.x))) + pad,
    ),
    bottom = Math.min(
      visible.y + visible.height,
      Math.ceil(Math.max(...points.map((p) => p.y))) + pad,
    );
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
  function gate(): Bounds {
    const corners = [
      { x: 0, y: 0 },
      { x: page.width, y: 0 },
      { x: 0, y: page.height },
      { x: page.width, y: page.height },
    ].map((p) => transformPoint(inverse, p));
    const x = Math.min(...corners.map((p) => p.x)) - 2,
      y = Math.min(...corners.map((p) => p.y)) - 2;
    return {
      x,
      y,
      width: Math.max(...corners.map((p) => p.x)) - x + 2,
      height: Math.max(...corners.map((p) => p.y)) - y + 2,
    };
  }
}
