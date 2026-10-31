import type { SpatialBoundsShape } from "./definitions";
import type { Composition } from "../../document/model";
import { DEFAULT_SPATIAL_SCENE } from "../defaults";
import { transformSpatial, type SpatialMatrix } from "../matrix";
/** Tangents of an affine ellipsoid, including planar ellipses, in an arbitrary camera gate. */
export function projectedEllipsoidBounds(
  page: Composition,
  world: SpatialMatrix,
  bounds: SpatialBoundsShape,
) {
  const scene = page.spatial ?? DEFAULT_SPATIAL_SCENE,
    camera = scene.camera,
    viewport = scene.viewport;
  const yaw = (camera.yaw * Math.PI) / 180,
    pitch = (camera.pitch * Math.PI) / 180,
    cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  const rows = [
    [cy, 0, -sy],
    [-sy * sp, cp, -cy * sp],
    [sy * cp, sp, cy * cp],
  ];
  const dot = (a: readonly number[], b: readonly number[]) =>
    a.reduce((sum, v, i) => sum + v * b[i]!, 0);
  const center = transformSpatial(world, bounds.center);
  const coefficients = rows.map((row) =>
    [0, 4, 8].map(
      (offset, index) => dot(row, world.slice(offset, offset + 3)) * bounds.halfSize[index]!,
    ),
  );
  const depth = camera.distance - dot(rows[2]!, center),
    d = coefficients[2]!.map((v) => -v);
  if (depth - Math.sqrt(dot(d, d)) <= 0.01)
    return { x: 0, y: 0, width: page.width, height: page.height };
  const interval = (axis: number) => {
    const c = dot(rows[axis]!, center),
      a = coefficients[axis]!;
    if (camera.projection === "orthographic") {
      const r = Math.sqrt(dot(a, a));
      return [c - r, c + r];
    }
    const aa = depth * depth - dot(d, d),
      bb = -2 * c * depth + 2 * dot(a, d),
      cc = c * c - dot(a, a);
    const root = Math.sqrt(Math.max(0, bb * bb - 4 * aa * cc));
    return [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)];
  };
  const x = interval(0),
    y = interval(1),
    height = viewport?.height ?? page.height,
    width = viewport?.width ?? page.width;
  const scale =
    height /
    (2 *
      Math.tan((camera.fov * Math.PI) / 360) *
      (camera.projection === "orthographic" ? camera.distance : 1));
  return {
    x: width / 2 + x[0]! * scale - (viewport?.x ?? 0),
    y: height / 2 - y[1]! * scale - (viewport?.y ?? 0),
    width: (x[1]! - x[0]!) * scale,
    height: (y[1]! - y[0]!) * scale,
  };
}
