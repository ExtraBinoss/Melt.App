import { spatialMorphPaths } from "./morph";
import {
  BufferAttribute,
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Shape,
  ShapePath,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GeometryPayload, SpatialGeometryJob } from "./geometry-model";
export function buildSpatialGeometry(job: SpatialGeometryJob): BufferGeometry {
  if (job.source === "box")
    return job.bevel > 0
      ? new RoundedBoxGeometry(
          1.8,
          1.8,
          1.8,
          Math.min(6, job.bevelSegments),
          Math.min(0.8, job.bevel),
        )
      : new BoxGeometry(1.8, 1.8, 1.8);
  if (job.source === "sphere") return new SphereGeometry(1, 48, 32);
  if (job.source === "torus") return new TorusGeometry(0.72, 0.26, 24, 64);
  if (job.source === "capsule") return new CapsuleGeometry(0.55, 0.9, 12, 32);
  if (job.source === "cone") return new ConeGeometry(0.95, 1.9, 48);
  if (job.source === "cylinder") return new CylinderGeometry(0.85, 0.85, 1.8, 48);
  const paths = spatialMorphPaths(job) ?? job.paths ?? [];
  const commands = paths.reduce((count, path) => count + path.length, 0);
  if (commands * (job.morph ? 1 : job.curveSegments) * (job.bevelSegments * 2 + 4) > 800_000)
    throw new RangeError("3D extrusion exceeds the geometry budget");
  const batches: { shapes: Shape[]; part: number }[] = [];
  for (const [index, commands] of paths.entries()) {
    const path = new ShapePath();
    path.userData.style = { fillRule: job.pathFillRules?.[index] ?? "nonzero" };
    for (const c of commands) {
      if (c.type === "M") path.moveTo(c.x!, c.y!);
      else if (c.type === "L") path.lineTo(c.x!, c.y!);
      else if (c.type === "Q") path.quadraticCurveTo(c.x1!, c.y1!, c.x!, c.y!);
      else if (c.type === "C") path.bezierCurveTo(c.x1!, c.y1!, c.x2!, c.y2!, c.x!, c.y!);
      else path.currentPath?.closePath();
    }
    batches.push({ shapes: path.toShapes(), part: job.pathParts?.[index] ?? 0 });
  }
  const built: BufferGeometry[] = [];
  try {
    let vertices = 0;
    for (const batch of batches) {
      if (!batch.shapes.length) continue;
      const geometry = new ExtrudeGeometry(batch.shapes, {
        depth: job.depth,
        bevelEnabled: job.bevel > 0,
        bevelSize: job.bevel,
        bevelThickness: job.bevel,
        bevelSegments: job.bevelSegments,
        curveSegments: job.curveSegments,
        steps: 1,
      });
      built.push(geometry);
      geometry.translate(0, 0, -job.depth / 2 + (job.pathParts ? batch.part * 0.0001 : 0));
      const count = geometry.getAttribute("position").count;
      vertices += count;
      if (vertices > 800_000) throw new RangeError("3D geometry exceeds the vertex budget");
      if (job.pathParts)
        geometry.setAttribute(
          "spatialPart",
          new BufferAttribute(new Float32Array(count).fill(batch.part), 1),
        );
    }
    if (!built.length) throw Error("3D extrusion needs visible filled outlines");
    const geometry = mergeGeometries(built, false);
    if (!geometry) throw Error("3D extrusion could not be combined");
    return geometry;
  } finally {
    for (const geometry of built) geometry.dispose();
  }
}
export function geometryPayload(geometry: BufferGeometry): GeometryPayload {
  return {
    attributes: Object.entries(geometry.attributes).map(([name, attribute]) => ({
      name,
      buffer: new Float32Array(attribute.array).buffer,
      itemSize: attribute.itemSize,
    })),
    ...(geometry.index ? { index: new Uint32Array(geometry.index.array).buffer } : {}),
  };
}
