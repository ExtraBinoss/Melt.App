import { Color } from "three";
import { editVectorPath, type VectorDefinition } from "@musart/core";

/** Dominance is estimated from declared path geometry, never a GPU pixel readback. */
export function vectorContrast(vector: VectorDefinition, fill: string, stroke: string) {
  const weights = new Map<string, number>();
  for (const part of vector.parts ?? [{ path: vector.path ?? "" }]) {
    const color =
      vector.strokeOnly || part.fill === "none"
        ? vector.preserveColors && part.stroke && part.stroke !== "currentColor"
          ? part.stroke
          : stroke
        : vector.preserveColors && part.fill && part.fill !== "currentColor"
          ? part.fill
          : fill;
    if (color === "none" || !color || (part.opacity ?? 1) === 0) continue;
    let weight = 1;
    try {
      const points = editVectorPath(part).flatMap((path) => path.nodes);
      if (points.length) {
        const xs = points.map((p) => p.x),
          ys = points.map((p) => p.y);
        weight = Math.max(
          1,
          (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)),
        );
      }
    } catch {
      /* The editor reports invalid/over-budget geometry separately. */
    }
    weights.set(color, (weights.get(color) ?? 0) + weight * (part.opacity ?? 1));
  }
  const candidate = [...weights].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fill;
  const dominant = candidate === "none" ? "#ffffff" : candidate;
  const color = new Color(dominant),
    luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const light = 1.05 / (luminance + 0.05) > (luminance + 0.05) / 0.05;
  return { dominant, ink: light ? "#ffffff" : "#000000", halo: light ? "#000000" : "#ffffff" };
}
