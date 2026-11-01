/** Frozen pre-batch adapter. Benchmark oracle only; production uses Three unchanged. */
import type { Layer } from "@musart/core";
import { Matrix4, ShapeGeometry } from "three/webgpu";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import type { VectorGeometryPart } from "../../packages/render/src/surface/vector/geometry";
import {
  hasFill,
  hasStroke,
  strokeWidth,
  vectorParts,
} from "../../packages/render/src/surface/vector/geometry";
const escape = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
export function parseVectorGeometryBaseline(layer: Layer): VectorGeometryPart[] {
  if (!layer.vector) throw Error("Missing vector");
  const result: VectorGeometryPart[] = [];
  try {
    for (const [partIndex, part] of vectorParts(layer.vector).entries()) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escape(layer.vector.viewBox)}"><path d="${escape(part.path)}" fill-rule="${part.fillRule ?? "nonzero"}"/></svg>`;
      for (const path of new SVGLoader().parse(svg).paths) {
        if (hasFill(layer, part)) {
          const shapes = path.toShapes();
          if (shapes.length)
            result.push({ geometry: new ShapeGeometry(shapes, 24), part, partIndex, kind: "fill" });
        }
        if (hasStroke(layer, part)) {
          const style = SVGLoader.getStrokeStyle(
            strokeWidth(layer, part),
            "#ffffff",
            part.linejoin ?? "round",
            part.linecap ?? "round",
          );
          for (const subpath of path.subPaths) {
            const points = subpath.getPoints(48);
            if (points.length < 2) continue;
            const geometry = SVGLoader.pointsToStroke(points, style, 12, 0.0001);
            if (geometry) result.push({ geometry, part, partIndex, kind: "stroke" });
          }
        }
      }
    }
    for (const item of result)
      if (item.part.matrix) {
        const [a, b, c, d, e, f] = item.part.matrix;
        item.geometry.applyMatrix4(
          new Matrix4().set(a, c, 0, e, b, d, 0, f, 0, 0, 1, 0, 0, 0, 0, 1),
        );
      }
    return result;
  } catch (error) {
    for (const item of result) item.geometry.dispose();
    throw error;
  }
}
