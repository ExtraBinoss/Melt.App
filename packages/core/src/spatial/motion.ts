import type { Layer } from "../document/model";
import type { MotionPropertySchema, MotionValue } from "../motion/properties/model";
import type { SpatialLayer, SpatialMaterial } from "./model";
import { SPATIAL_MATERIAL_NUMBERS, SPATIAL_NUMBERS } from "./validation";
export type SpatialMotionProperty =
  | `spatial.${keyof typeof SPATIAL_NUMBERS}`
  | `spatial.material.${keyof typeof SPATIAL_MATERIAL_NUMBERS}`;
export const SPATIAL_MOTION_SCHEMAS = Object.freeze(
  Object.fromEntries([
    ...Object.entries(SPATIAL_NUMBERS).map(([key, [min, max]]) => [
      `spatial.${key}`,
      {
        kind: ["bevelSegments", "curveSegments", "clip"].includes(key) ? "integer" : "number",
        min,
        max,
        interpolation: key === "clip" ? "hold" : "continuous",
      },
    ]),
    ...Object.entries(SPATIAL_MATERIAL_NUMBERS).map(([key, [min, max]]) => [
      `spatial.material.${key}`,
      {
        kind: "number",
        min,
        max,
        interpolation: "continuous",
      },
    ]),
  ]) as Record<SpatialMotionProperty, MotionPropertySchema>,
);
export function isSpatialMotionProperty(property: string): property is SpatialMotionProperty {
  return Object.hasOwn(SPATIAL_MOTION_SCHEMAS, property);
}
export function readSpatialMotionValue(layer: Layer, property: SpatialMotionProperty): unknown {
  if (!layer.spatial) return undefined;
  if (property.startsWith("spatial.material."))
    return layer.spatial.material[property.slice(17) as keyof SpatialMaterial];
  return layer.spatial[property.slice(8) as keyof SpatialLayer];
}
/** Registry-allowlisted addresses only; callers have already validated the scalar value. */
export function withSpatialMotionValue(
  layer: Layer,
  property: SpatialMotionProperty,
  value: MotionValue,
): Layer {
  const spatial = layer.spatial!;
  return {
    ...layer,
    spatial: property.startsWith("spatial.material.")
      ? { ...spatial, material: { ...spatial.material, [property.slice(17)]: value } }
      : { ...spatial, [property.slice(8)]: value },
  };
}
