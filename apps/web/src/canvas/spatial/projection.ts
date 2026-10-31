import { createLayerGeometryIndex, type Composition, type Layer } from "@musart/core";
import { Matrix4, type Camera } from "three/webgpu";
/** Compose the source camera with classic layer layout, including ancestors and 2D rotation. */
export function projectLayerCamera(
  source: Camera,
  destination: Camera,
  page: Composition,
  layer: Layer,
) {
  destination.copy(source, false);
  const [a, b, c, d, e, f] = createLayerGeometryIndex(page).worldMatrix(layer.id);
  const w = layer.width,
    h = layer.height,
    pw = page.width,
    ph = page.height;
  const frame = new Matrix4().set(
    (a * w) / pw,
    (-c * h) / pw,
    0,
    (a * w + c * h + 2 * e) / pw - 1,
    (-b * w) / ph,
    (d * h) / ph,
    0,
    1 - (b * w + d * h + 2 * f) / ph,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
  );
  destination.projectionMatrix.premultiply(frame);
  destination.projectionMatrixInverse.copy(destination.projectionMatrix).invert();
  destination.updateMatrixWorld(true);
}
