import { layerTransform, type Bounds, type Layer } from "@musart/core";
import type { Matrix4 } from "three/webgpu";

/** Map the unit source quad (upward Y) into the authored downward-Y affine frame. */
export function placementMatrix(
  target: Matrix4,
  layer: Layer,
  origin?: Pick<Bounds, "x" | "y">,
): Matrix4 {
  const [a, b, c, d, e, f] = layerTransform(layer);
  return target.set(
    a * layer.width,
    -c * layer.height,
    0,
    e + (a * layer.width + c * layer.height) / 2 - (origin?.x ?? 0),
    b * layer.width,
    -d * layer.height,
    0,
    f + (b * layer.width + d * layer.height) / 2 - (origin?.y ?? 0),
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
