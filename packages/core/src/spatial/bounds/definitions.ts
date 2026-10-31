import type { Layer } from "../../document/model";
import type { SpatialPrimitive, SpatialSource } from "../model";
export interface SpatialBoundsShape {
  kind: "box" | "ellipsoid";
  center: readonly [number, number, number];
  halfSize: readonly [number, number, number];
}
const box = (x: number, y = x, z = x): SpatialBoundsShape => ({
  kind: "box",
  center: [0, 0, 0],
  halfSize: [x, y, z],
});
const ellipsoid = (x: number, y = x, z = x): SpatialBoundsShape => ({
  kind: "ellipsoid",
  center: [0, 0, 0],
  halfSize: [x, y, z],
});
const radial = (radius: number) => ({ radius, bounds: box(radius) });
const sphere = (radius: number) => ({ radius, bounds: ellipsoid(radius) });
const cylinder = (radius: number, height: number) => ({
  radius,
  height,
  bounds: box(radius, height / 2, radius),
});
const capsule = (radius: number, length: number) => ({
  radius,
  length,
  bounds: box(radius, length / 2 + radius, radius),
});
const torus = (radius: number, tube: number) => ({
  radius,
  tube,
  bounds: box(radius + tube, radius + tube, tube),
});
const knot = (radius: number, tube: number, p: number, q: number) => ({
  radius,
  tube,
  p,
  q,
  bounds: box(1.5 * radius + tube, 1.5 * radius + tube, 0.5 * radius + tube),
});
const lathePoints = [
  [0, -1],
  [0.55, -1],
  [0.62, -0.6],
  [0.32, 0],
  [0.3, 0.6],
  [0.5, 1],
  [0.42, 1],
  [0.23, 0.6],
  [0.25, 0],
  [0.55, -0.6],
  [0.45, -0.9],
  [0, -0.9],
] as const;
const tubePoints = [
  [-0.9, -0.6, 0.1],
  [-0.6, 0.3, -0.4],
  [0, 0.6, 0.1],
  [0.6, 0.2, 0.4],
  [0.9, -0.4, 0.1],
] as const;
export const SPATIAL_MODEL_EXTENT = 1.8;
/** Canonical primitive dimensions are shared by pure geometry and native Three builders. */
export const SPATIAL_GEOMETRY_DEFINITIONS = {
  box: { size: 1.8, bounds: box(1.8 / 2) },
  sphere: sphere(1),
  torus: torus(0.72, 0.26),
  capsule: capsule(0.55, 0.9),
  cone: cylinder(0.95, 1.9),
  cylinder: cylinder(0.85, 1.8),
  circle: { radius: 1, bounds: ellipsoid(1, 1, 0) },
  plane: { size: 1.8, bounds: box(0.9, 0.9, 0) },
  ring: { inner: 0.5, outer: 1, bounds: ellipsoid(1, 1, 0) },
  dodecahedron: radial(1.1),
  icosahedron: radial(1.1),
  octahedron: radial(1.1),
  tetrahedron: radial(1.2),
  torusKnot: knot(0.66, 0.2, 2, 3),
  lathe: {
    points: lathePoints,
    bounds: box(
      Math.max(...lathePoints.map((p) => p[0])),
      1,
      Math.max(...lathePoints.map((p) => p[0])),
    ),
  },
  tube: { points: tubePoints, radius: 0.16, bounds: box(1.6) },
  polyhedron: {
    radius: 1.1,
    vertices: [0, 1, 0.1, 0, -1, -0.1, 1, 0.15, 0, 0.15, 0, 1, -1, -0.1, 0, -0.1, 0, -1],
    indices: [0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 2, 1, 3, 2, 1, 4, 3, 1, 5, 4, 1, 2, 5],
    bounds: box(1.1),
  },
  edges: { size: 1.5, radius: 0.018, bounds: box(1.5 / 2 + 0.018) },
  wireframe: { radius: 1, rodRadius: 0.018, bounds: box(1 + 0.018) },
} as const satisfies Record<
  Exclude<SpatialPrimitive, "shape">,
  { bounds: SpatialBoundsShape } & Record<string, unknown>
>;
const frame = (layer: Layer): SpatialBoundsShape => {
  const unit = Math.min(layer.width, layer.height),
    spatial = layer.spatial!;
  return box(
    layer.width / unit + spatial.bevel,
    layer.height / unit + spatial.bevel,
    spatial.depth / 2 + spatial.bevel,
  );
};
/** Every source has a registered intrinsic-bound contract; imported models use normalized bounds. */
const sourceBounds = {
  ...SPATIAL_GEOMETRY_DEFINITIONS,
  extrude: { bounds: frame },
  shape: {
    bounds: (layer: Layer) =>
      box(
        layer.width / Math.min(layer.width, layer.height),
        layer.height / Math.min(layer.width, layer.height),
        0,
      ),
  },
  glb: { bounds: box(SPATIAL_MODEL_EXTENT / 2) },
  group: { bounds: box(0) },
} satisfies Record<
  SpatialSource,
  { bounds: SpatialBoundsShape | ((layer: Layer) => SpatialBoundsShape) }
>;
export function spatialSourceBounds(layer: Layer): SpatialBoundsShape {
  const bounds = sourceBounds[layer.spatial!.source].bounds;
  return typeof bounds === "function" ? bounds(layer) : bounds;
}
