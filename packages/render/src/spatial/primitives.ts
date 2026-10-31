import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  EdgesGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  OctahedronGeometry,
  PlaneGeometry,
  PolyhedronGeometry,
  RingGeometry,
  SphereGeometry,
  TetrahedronGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  TubeGeometry,
  WireframeGeometry,
  CatmullRomCurve3,
  Quaternion,
  Vector2,
  Vector3,
  type BufferGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SPATIAL_GEOMETRY_DEFINITIONS as definitions, type SpatialPrimitive } from "@musart/core";
import type { SpatialGeometryJob } from "./geometry-model";
function rods(lines: BufferGeometry, radius: number) {
  const parts: BufferGeometry[] = [];
  try {
    const points = lines.getAttribute("position"),
      up = new Vector3(0, 1, 0);
    for (let i = 0; i < points.count; i += 2) {
      const a = new Vector3().fromBufferAttribute(points, i),
        b = new Vector3().fromBufferAttribute(points, i + 1);
      const direction = b.clone().sub(a),
        geometry = new CylinderGeometry(radius, radius, direction.length(), 8);
      geometry.applyQuaternion(new Quaternion().setFromUnitVectors(up, direction.normalize()));
      geometry.translate(...a.add(b).multiplyScalar(0.5).toArray());
      parts.push(geometry);
    }
    const merged = mergeGeometries(parts, false);
    if (!merged) throw Error("Unable to create 3D wire geometry");
    return merged;
  } finally {
    for (const part of parts) part.dispose();
    lines.dispose();
  }
}
const builders: Record<
  Exclude<SpatialPrimitive, "shape">,
  (job: SpatialGeometryJob) => BufferGeometry
> = {
  box: (job) =>
    job.bevel > 0
      ? new RoundedBoxGeometry(
          definitions.box.size,
          definitions.box.size,
          definitions.box.size,
          Math.min(6, job.bevelSegments),
          Math.min(0.8, job.bevel),
        )
      : new BoxGeometry(definitions.box.size, definitions.box.size, definitions.box.size),
  sphere: () => new SphereGeometry(definitions.sphere.radius, 48, 32),
  torus: () => new TorusGeometry(definitions.torus.radius, definitions.torus.tube, 24, 64),
  capsule: () =>
    new CapsuleGeometry(definitions.capsule.radius, definitions.capsule.length, 12, 32),
  cone: () => new ConeGeometry(definitions.cone.radius, definitions.cone.height, 48),
  cylinder: () =>
    new CylinderGeometry(
      definitions.cylinder.radius,
      definitions.cylinder.radius,
      definitions.cylinder.height,
      48,
    ),
  circle: () => new CircleGeometry(definitions.circle.radius, 64),
  plane: () => new PlaneGeometry(definitions.plane.size, definitions.plane.size),
  ring: () => new RingGeometry(definitions.ring.inner, definitions.ring.outer, 64),
  dodecahedron: () => new DodecahedronGeometry(definitions.dodecahedron.radius, 0),
  icosahedron: () => new IcosahedronGeometry(definitions.icosahedron.radius, 0),
  octahedron: () => new OctahedronGeometry(definitions.octahedron.radius, 0),
  tetrahedron: () => new TetrahedronGeometry(definitions.tetrahedron.radius, 0),
  torusKnot: () =>
    new TorusKnotGeometry(
      definitions.torusKnot.radius,
      definitions.torusKnot.tube,
      128,
      16,
      definitions.torusKnot.p,
      definitions.torusKnot.q,
    ),
  lathe: () =>
    new LatheGeometry(
      definitions.lathe.points.map((point) => new Vector2(...point)),
      48,
    ),
  tube: () =>
    new TubeGeometry(
      new CatmullRomCurve3(definitions.tube.points.map((point) => new Vector3(...point))),
      64,
      definitions.tube.radius,
      12,
      false,
    ),
  polyhedron: () =>
    new PolyhedronGeometry(
      [...definitions.polyhedron.vertices],
      [...definitions.polyhedron.indices],
      definitions.polyhedron.radius,
      0,
    ),
  edges: () => {
    const geometry = new BoxGeometry(
      definitions.edges.size,
      definitions.edges.size,
      definitions.edges.size,
    );
    try {
      return rods(new EdgesGeometry(geometry), definitions.edges.radius);
    } finally {
      geometry.dispose();
    }
  },
  wireframe: () => {
    const geometry = new IcosahedronGeometry(definitions.wireframe.radius, 0);
    try {
      return rods(new WireframeGeometry(geometry), definitions.wireframe.rodRadius);
    } finally {
      geometry.dispose();
    }
  },
};
export function spatialPrimitiveGeometry(job: SpatialGeometryJob): BufferGeometry | null {
  return job.source === "extrude" || job.source === "shape" ? null : builders[job.source](job);
}
