import {
  invertMatrix,
  transformPoint,
  type Layer,
  type Point,
  type VectorDefinition,
  type VectorPart,
  type Matrix,
} from "@musart/core";
interface PreparedPart {
  part: VectorPart;
  path: Path2D;
  inverse?: Matrix;
}
interface PreparedVector {
  parts: readonly PreparedPart[];
  box: readonly number[];
}
const prepared = new WeakMap<VectorDefinition, PreparedVector>();
const painted = (paint: string | undefined) =>
  paint !== "none" &&
  paint !== "transparent" &&
  !(paint?.length === 9 && paint.endsWith("00")) &&
  !(paint?.length === 5 && paint.endsWith("0"));
/** Paths compile during scene preparation; native path tests allocate no raster pixels. */
export function prepareVectorHit(layer: Layer) {
  const vector = layer.vector;
  if (!vector || prepared.has(vector) || typeof Path2D === "undefined") return;
  try {
    prepared.set(vector, {
      box: vector.viewBox
        .trim()
        .split(/[\s,]+/)
        .map(Number),
      parts: (vector.parts ?? [{ path: vector.path ?? "" }]).map((part) => ({
        part,
        path: new Path2D(part.path),
        ...(part.matrix ? { inverse: invertMatrix(part.matrix) } : {}),
      })),
    });
  } catch {
    /* Invalid/unsupported native paths keep geometry fallback. */
  }
}
export function vectorContentHit(
  context: OffscreenCanvasRenderingContext2D,
  layer: Layer,
  local: Point,
): boolean {
  const vector = layer.vector,
    source = vector && prepared.get(vector);
  if (!vector || !source) return true;
  const { box, parts } = source;
  const point = {
    x: box[0]! + (local.x / layer.width) * box[2]!,
    y: box[1]! + (local.y / layer.height) * box[3]!,
  };
  for (const { part, path, inverse } of parts) {
    if ((part.opacity ?? 1) <= 0) continue;
    const p = inverse ? transformPoint(inverse, point) : point;
    const fill = vector.preserveColors ? (part.fill ?? "#000000") : layer.fill;
    if (
      !vector.strokeOnly &&
      painted(fill) &&
      part.fill !== "none" &&
      context.isPointInPath(path, p.x, p.y, part.fillRule ?? "nonzero")
    )
      return true;
    const stroke = vector.preserveColors
      ? part.stroke === "currentColor" || !part.stroke
        ? layer.fill
        : part.stroke
      : !vector.strokeOnly && layer.strokeWidth > 0
        ? layer.stroke
        : layer.fill;
    if (
      part.stroke !== "none" &&
      (vector.strokeOnly || part.stroke || layer.strokeWidth > 0) &&
      painted(stroke)
    ) {
      context.lineWidth = vector.preserveColors
        ? (part.strokeWidth ?? (layer.strokeWidth || 1))
        : layer.strokeWidth || part.strokeWidth || 2;
      context.lineCap = part.linecap ?? "round";
      context.lineJoin = part.linejoin ?? "round";
      if (context.isPointInStroke(path, p.x, p.y)) return true;
    }
  }
  return false;
}

export function primitiveContentHit(layer: Layer, local: Point): boolean {
  if (layer.kind !== "rectangle" && layer.kind !== "ellipse") return true;
  const width = layer.width,
    height = layer.height;
  const inside = (inset: number) => {
    const w = width - inset * 2,
      h = height - inset * 2;
    if (w <= 0 || h <= 0) return false;
    const x = local.x - inset,
      y = local.y - inset;
    if (x < 0 || y < 0 || x > w || y > h) return false;
    if (layer.kind === "ellipse")
      return ((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2 <= 1;
    const radius = Math.min(w / 2, h / 2, Math.max(0, layer.radius - inset));
    const dx = Math.max(radius - x, 0, x - (w - radius));
    const dy = Math.max(radius - y, 0, y - (h - radius));
    return dx * dx + dy * dy <= radius * radius;
  };
  return (
    inside(0) &&
    ((layer.fillGradient
      ? layer.fillGradient.stops.some((stop) => painted(stop.color))
      : painted(layer.fill)) ||
      (layer.strokeWidth > 0 && painted(layer.stroke) && !inside(layer.strokeWidth / 2)))
  );
}
