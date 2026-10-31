import { createLayer, createSpatialLayer, type SpatialSource } from "@musart/core";
import { brand } from "../../ui/brand/config";
const STAR = "M50 2L62 35L98 38L70 60L79 95L50 75L21 95L30 60L2 38L38 35Z";
/** Defaults shared by library insertion and its synthetic render documents. */
export function spatialLibraryLayer(
  source: SpatialSource | "text",
  size: number,
  name: string,
  id: string,
) {
  const vector = source === "shape" || source === "extrude";
  return createLayer(source === "text" ? "text" : vector ? "vector" : "rectangle", {
    id,
    name,
    x: 0,
    y: 0,
    width: size,
    height: size,
    fill: brand.colors.primary,
    ...(source === "text"
      ? {
          text: brand.name,
          fontSize: size * 0.36,
          fontWeight: 700,
          textAlign: "center" as const,
          height: size * 0.45,
        }
      : {}),
    ...(vector ? { vector: { viewBox: "0 0 100 100", parts: [{ path: STAR }] } } : {}),
    spatial: {
      ...createSpatialLayer(source === "text" ? "extrude" : source),
      ...(source === "text" ? { depth: 0.12, bevel: 0.01 } : {}),
    },
  });
}
