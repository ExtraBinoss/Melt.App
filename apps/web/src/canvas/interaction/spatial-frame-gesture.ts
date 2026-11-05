import { layerTransform, transformPoint, type Bounds, type Layer, type Point } from "@musart/core";
import type { Handle } from "./gestures";

/** Native text's dimensions remain layout/wrapping inputs. Classic handles scale
 * the prepared ink instead, holding the visible opposite edge (or center) still.
 */
export function spatialFramePatch(
  layer: Layer,
  bounds: Bounds,
  handle: Handle,
  from: Point,
  to: Point,
  keepAspect: boolean,
): Partial<Layer> {
  if (handle === "rotate") return {};
  const west = handle.includes("w"),
    north = handle.includes("n");
  const horizontal = west || handle.includes("e"),
    vertical = north || handle.includes("s");
  let xRatio = horizontal
    ? Math.max(1 / bounds.width, 1 + ((west ? -1 : 1) * (to.x - from.x)) / bounds.width)
    : 1;
  let yRatio = vertical
    ? Math.max(1 / bounds.height, 1 + ((north ? -1 : 1) * (to.y - from.y)) / bounds.height)
    : 1;
  if (keepAspect) {
    const ratio = !horizontal
      ? yRatio
      : !vertical
        ? xRatio
        : Math.abs(xRatio - 1) > Math.abs(yRatio - 1)
          ? xRatio
          : yRatio;
    xRatio = yRatio = Math.max(ratio, 1 / bounds.width, 1 / bounds.height);
  }
  const patch = { scaleX: (layer.scaleX ?? 1) * xRatio, scaleY: (layer.scaleY ?? 1) * yRatio };
  return anchorSpatialFrame(layer, patch, {
    x: bounds.x + bounds.width * (west ? 1 : horizontal ? 0 : 0.5),
    y: bounds.y + bounds.height * (north ? 1 : vertical ? 0 : 0.5),
  });
}

export function anchorSpatialFrame(
  layer: Layer,
  patch: Partial<Layer>,
  anchor: Point,
): Partial<Layer> {
  const before = transformPoint(layerTransform(layer), anchor);
  const after = transformPoint(layerTransform({ ...layer, ...patch, x: 0, y: 0 }), anchor);
  return { ...patch, x: before.x - after.x, y: before.y - after.y };
}
