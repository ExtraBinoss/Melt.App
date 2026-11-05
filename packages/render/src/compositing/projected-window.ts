import {
  invertMatrix,
  SpatialGeometry,
  transformPoint,
  type Bounds,
  type Composition,
  type Layer,
} from "@musart/core";
import { Matrix3, Vector3 } from "three/webgpu";

/** The actual composition gate expressed in the source's unchanged layout coordinates. */
export function projectedEffectWindow(page: Composition, layer: Layer, viewport?: Bounds): Bounds {
  const inverse = invertMatrix(new SpatialGeometry(page).layoutMatrix(layer.id));
  const region = viewport ?? { x: 0, y: 0, width: page.width, height: page.height };
  const points = [
    { x: region.x, y: region.y },
    { x: region.x + region.width, y: region.y },
    { x: region.x + region.width, y: region.y + region.height },
    { x: region.x, y: region.y + region.height },
  ].map((point) => transformPoint(inverse, point));
  const x = Math.min(...points.map((point) => point.x)) - 2;
  const y = Math.min(...points.map((point) => point.y)) - 2;
  return {
    x,
    y,
    width: Math.max(...points.map((point) => point.x)) - x + 2,
    height: Math.max(...points.map((point) => point.y)) - y + 2,
  };
}

function clipPolygon(polygon: Vector3[], planes: readonly ((p: Vector3) => number)[]) {
  for (const plane of planes) {
    const clipped: Vector3[] = [];
    for (let index = 0; index < polygon.length; index++) {
      const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
      const current = polygon[index]!;
      const a = plane(previous),
        b = plane(current);
      if (a >= 0 !== b >= 0) clipped.push(previous.clone().lerp(current, a / (a - b)));
      if (b >= 0) clipped.push(current);
    }
    polygon = clipped;
  }
  return polygon;
}

/** Match ProjectionPass's finite horizon guard before perspective division. */
export function finiteProjectedPoints(bounds: Bounds, matrix: Matrix3, window?: Bounds) {
  const vertices = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x + bounds.width, bounds.y + bounds.height],
    [bounds.x, bounds.y + bounds.height],
  ].map(([x, y]) => new Vector3(x!, y!, 1).applyMatrix3(matrix));
  if (vertices.some((point) => !point.toArray().every(Number.isFinite)))
    throw new RangeError("Invalid spatial effect projection.");
  const result: Vector3[] = [];
  for (const sign of [1, -1]) {
    const planes = [(p: Vector3) => p.z - 0.000001];
    if (window)
      planes.push(
        (p) => p.x - window.x * p.z,
        (p) => (window.x + window.width) * p.z - p.x,
        (p) => p.y - window.y * p.z,
        (p) => (window.y + window.height) * p.z - p.y,
      );
    const polygon = clipPolygon(
      vertices.map((point) => point.clone().multiplyScalar(sign)),
      planes,
    );
    result.push(...polygon.map((point) => point.divideScalar(point.z)));
  }
  return result;
}

/** Clip before perspective division: a rectangle crossing the horizon stays window-bounded. */
export function clipProjectedBounds(bounds: Bounds, matrix: Matrix3, window: Bounds): Bounds {
  const result = finiteProjectedPoints(bounds, matrix, window);
  if (!result.length) return { x: window.x, y: window.y, width: 1, height: 1 };
  const x = Math.max(window.x, Math.min(...result.map((p) => p.x)));
  const y = Math.max(window.y, Math.min(...result.map((p) => p.y)));
  return {
    x,
    y,
    width: Math.max(
      1e-6,
      Math.min(window.x + window.width, Math.max(...result.map((p) => p.x))) - x,
    ),
    height: Math.max(
      1e-6,
      Math.min(window.y + window.height, Math.max(...result.map((p) => p.y))) - y,
    ),
  };
}
