import type { Composition } from "../../document/model";
import type { Bounds } from "../../layers/geometry";
import { DEFAULT_SPATIAL_SCENE } from "../defaults";
import { transformSpatial, type SpatialMatrix } from "../matrix";
import type { SpatialBoundsShape } from "./definitions";
import { projectedEllipsoidBounds } from "./ellipsoid";
function projectBox(page: Composition, world: SpatialMatrix, bounds: SpatialBoundsShape): Bounds {
  const points: { x: number; y: number }[] = [];
  const camera = (page.spatial ?? DEFAULT_SPATIAL_SCENE).camera;
  const yaw = (camera.yaw * Math.PI) / 180,
    pitch = (camera.pitch * Math.PI) / 180;
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  const viewport = page.spatial?.viewport,
    h = viewport?.height ?? page.height,
    w = viewport?.width ?? page.width;
  const half = camera.distance * Math.tan((camera.fov * Math.PI) / 360);
  for (const dx of [bounds.center[0] - bounds.halfSize[0], bounds.center[0] + bounds.halfSize[0]])
    for (const dy of [bounds.center[1] - bounds.halfSize[1], bounds.center[1] + bounds.halfSize[1]])
      for (const dz of [
        bounds.center[2] - bounds.halfSize[2],
        bounds.center[2] + bounds.halfSize[2],
      ]) {
        const p = transformSpatial(world, [dx, dy, dz]);
        const vx = cy * p[0]! - sy * p[2]!,
          vy = -sy * sp * p[0]! + cp * p[1]! - cy * sp * p[2]!;
        const depth = camera.distance - (sy * cp * p[0]! + sp * p[1]! + cy * cp * p[2]!);
        if (depth <= 0.01) return { x: 0, y: 0, width: page.width, height: page.height };
        const factor = camera.projection === "perspective" ? camera.distance / depth : 1;
        points.push({
          x: w / 2 + (vx * factor * h) / (2 * half) - (viewport?.x ?? 0),
          y: h / 2 - (vy * factor * h) / (2 * half) - (viewport?.y ?? 0),
        });
      }
  const left = Math.min(...points.map((p) => p.x)),
    top = Math.min(...points.map((p) => p.y));
  return {
    x: left,
    y: top,
    width: Math.max(...points.map((p) => p.x)) - left,
    height: Math.max(...points.map((p) => p.y)) - top,
  };
}
const projectors: Record<
  SpatialBoundsShape["kind"],
  (page: Composition, world: SpatialMatrix, bounds: SpatialBoundsShape) => Bounds
> = {
  box: projectBox,
  ellipsoid: projectedEllipsoidBounds,
};
export function projectSpatialBounds(
  page: Composition,
  world: SpatialMatrix,
  bounds: SpatialBoundsShape,
): Bounds {
  return projectors[bounds.kind](page, world, bounds);
}
