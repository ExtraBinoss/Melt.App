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
import type { SpatialPrimitive } from "@musart/core";
import type { SpatialGeometryJob } from "./geometry-model";
function rods(lines: BufferGeometry) {
  const parts: BufferGeometry[] = [];
  try {
    const points = lines.getAttribute("position"),
      up = new Vector3(0, 1, 0);
    for (let i = 0; i < points.count; i += 2) {
      const a = new Vector3().fromBufferAttribute(points, i),
        b = new Vector3().fromBufferAttribute(points, i + 1);
      const direction = b.clone().sub(a),
        geometry = new CylinderGeometry(0.018, 0.018, direction.length(), 8);
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
          1.8,
          1.8,
          1.8,
          Math.min(6, job.bevelSegments),
          Math.min(0.8, job.bevel),
        )
      : new BoxGeometry(1.8, 1.8, 1.8),
  sphere: () => new SphereGeometry(1, 48, 32),
  torus: () => new TorusGeometry(0.72, 0.26, 24, 64),
  capsule: () => new CapsuleGeometry(0.55, 0.9, 12, 32),
  cone: () => new ConeGeometry(0.95, 1.9, 48),
  cylinder: () => new CylinderGeometry(0.85, 0.85, 1.8, 48),
  circle: () => new CircleGeometry(1, 64),
  plane: () => new PlaneGeometry(1.8, 1.8),
  ring: () => new RingGeometry(0.5, 1, 64),
  dodecahedron: () => new DodecahedronGeometry(1.1, 0),
  icosahedron: () => new IcosahedronGeometry(1.1, 0),
  octahedron: () => new OctahedronGeometry(1.1, 0),
  tetrahedron: () => new TetrahedronGeometry(1.2, 0),
  torusKnot: () => new TorusKnotGeometry(0.66, 0.2, 128, 16, 2, 3),
  lathe: () =>
    new LatheGeometry(
      [
        new Vector2(0, -1),
        new Vector2(0.55, -1),
        new Vector2(0.62, -0.6),
        new Vector2(0.32, 0),
        new Vector2(0.3, 0.6),
        new Vector2(0.5, 1),
        new Vector2(0.42, 1),
        new Vector2(0.23, 0.6),
        new Vector2(0.25, 0),
        new Vector2(0.55, -0.6),
        new Vector2(0.45, -0.9),
        new Vector2(0, -0.9),
      ],
      48,
    ),
  tube: () =>
    new TubeGeometry(
      new CatmullRomCurve3([
        new Vector3(-0.9, -0.6, 0.1),
        new Vector3(-0.6, 0.3, -0.4),
        new Vector3(0, 0.6, 0.1),
        new Vector3(0.6, 0.2, 0.4),
        new Vector3(0.9, -0.4, 0.1),
      ]),
      64,
      0.16,
      12,
      false,
    ),
  polyhedron: () =>
    new PolyhedronGeometry(
      [0, 1, 0.1, 0, -1, -0.1, 1, 0.15, 0, 0.15, 0, 1, -1, -0.1, 0, -0.1, 0, -1],
      [0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 2, 1, 3, 2, 1, 4, 3, 1, 5, 4, 1, 2, 5],
      1.1,
      0,
    ),
  edges: () => {
    const geometry = new BoxGeometry(1.5, 1.5, 1.5);
    try {
      return rods(new EdgesGeometry(geometry));
    } finally {
      geometry.dispose();
    }
  },
  wireframe: () => {
    const geometry = new IcosahedronGeometry(1, 0);
    try {
      return rods(new WireframeGeometry(geometry));
    } finally {
      geometry.dispose();
    }
  },
};
export function spatialPrimitiveGeometry(job: SpatialGeometryJob): BufferGeometry | null {
  return job.source === "extrude" || job.source === "shape" ? null : builders[job.source](job);
}
