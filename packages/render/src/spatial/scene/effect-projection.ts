import {
  invertMatrix,
  type Bounds,
  type Composition,
  type Layer,
  type SpatialGeometry,
} from "@musart/core";
import { Matrix3, Matrix4, Mesh, type Camera, type Object3D } from "three/webgpu";

/** Source-local projected layout pixels to authored pixels on a native front face.
 * The canonical camera is deliberately used before any transport/window crop.
 */
export function spatialEffectProjection(
  page: Composition,
  layer: Layer,
  content: Object3D,
  camera: Camera,
  geometry: SpatialGeometry,
  transport?: Bounds,
): readonly number[] | undefined {
  if (
    (layer.kind !== "text" && layer.kind !== "vector") ||
    !["extrude", "shape"].includes(layer.spatial?.source ?? "") ||
    !(content instanceof Mesh) ||
    !(layer.width > 0 && layer.height > 0)
  )
    return;
  if (!content.geometry.boundingBox) content.geometry.computeBoundingBox();
  const box = content.geometry.boundingBox;
  if (!box || box.isEmpty()) return;
  // Match outlines/morph geometry normalization, including its nonzero front depth.
  const unit = 2 / Math.min(layer.width, layer.height);
  const authored = new Matrix4().set(
    unit,
    0,
    0,
    (-layer.width * unit) / 2,
    0,
    -unit,
    0,
    (layer.height * unit) / 2,
    0,
    0,
    1,
    box.max.z,
    0,
    0,
    0,
    1,
  );
  const view = new Matrix4()
    .copy(camera.matrixWorldInverse)
    .multiply(new Matrix4().fromArray(geometry.worldMatrix(layer.id)))
    .multiply(content.matrix)
    .multiply(authored);
  // A plane crossing the camera cannot supply a continuous finite effect field.
  const v = view.elements;
  for (const x of [0, layer.width])
    for (const y of [0, layer.height]) if (!(v[2]! * x + v[6]! * y + v[14]! < -0.01)) return;
  const clip = camera.projectionMatrix.clone().multiply(view).elements;
  const pixels = new Matrix3().set(
    ((clip[0]! + clip[3]!) * page.width) / 2,
    ((clip[4]! + clip[7]!) * page.width) / 2,
    ((clip[12]! + clip[15]!) * page.width) / 2,
    ((clip[3]! - clip[1]!) * page.height) / 2,
    ((clip[7]! - clip[5]!) * page.height) / 2,
    ((clip[15]! - clip[13]!) * page.height) / 2,
    clip[3]!,
    clip[7]!,
    clip[15]!,
  );
  const [a, b, c, d, e, f] = invertMatrix(geometry.layoutMatrix(layer.id));
  pixels.premultiply(new Matrix3().set(a, c, e, b, d, f, 0, 0, 1));
  const m = pixels.elements;
  if (!m.every(Number.isFinite)) return;
  const magnitude =
    Math.hypot(m[0]!, m[3]!, m[6]!) *
    Math.hypot(m[1]!, m[4]!, m[7]!) *
    Math.hypot(m[2]!, m[5]!, m[8]!);
  if (Math.abs(pixels.determinant()) <= Number.EPSILON * 32 * magnitude) return;
  const result = pixels.invert().elements;
  if (!result.every(Number.isFinite)) return;
  if (transport) {
    // A volume still has visible sides when its front face is viewed edge-on.
    // If that raster crosses the inverse plane's horizon, no finite authored
    // rectangle can hold it. Keep effects on the complete native raster instead
    // of downsampling an effectively infinite intermediate and losing coverage.
    let sign = 0;
    for (const x of [transport.x, transport.x + transport.width])
      for (const y of [transport.y, transport.y + transport.height]) {
        const w = result[2]! * x + result[5]! * y + result[8]!;
        if (Math.abs(w) <= 0.000001 || (sign && Math.sign(w) !== sign)) return;
        sign = Math.sign(w);
      }
  }
  return result;
}
