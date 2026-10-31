import type { SpatialLayer } from "../spatial/model";
import { SPATIAL_MATERIAL_NUMBERS, SPATIAL_NUMBERS } from "../spatial/validation";

const spatialFields = new Set([
  ...Object.keys(SPATIAL_NUMBERS),
  "basis",
  "pivot",
  "enabled",
  "source",
  "material",
  "castShadow",
  "receiveShadow",
  "useModelMaterials",
]);
const materialFields = new Set(["preset", ...Object.keys(SPATIAL_MATERIAL_NUMBERS)]);
const capabilityFields = [
  "source",
  "enabled",
  "useModelMaterials",
  "castShadow",
  "receiveShadow",
] as const satisfies readonly (keyof SpatialLayer)[];
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function scalar(value: unknown): boolean {
  return value === undefined || ["string", "number", "boolean"].includes(typeof value);
}
function sameFrame(before: readonly number[] | undefined, after: unknown): boolean {
  return (
    before === after ||
    (Array.isArray(before) &&
      Array.isArray(after) &&
      before.length === after.length &&
      before.every((value, index) => Object.is(value, after[index])))
  );
}
/**
 * A replacement may change only registered values, keeping the existing source and
 * capability/frame boundaries. Numeric/material validity is still checked by validateLayer.
 * No open-ended objects, new identities, asset references or source transitions are certified.
 */
export function spatialReplacementPreservesScope(
  before: SpatialLayer | undefined,
  value: unknown,
): boolean {
  if (!before || !isRecord(value) || !isRecord(value.material)) return false;
  if (
    !Object.entries(value).every(
      ([key, child]) =>
        spatialFields.has(key) &&
        (key === "material" || key === "basis" || key === "pivot" || scalar(child)),
    )
  )
    return false;
  if (
    !Object.entries(value.material).every(
      ([key, child]) => materialFields.has(key) && scalar(child),
    )
  )
    return false;
  if (!capabilityFields.every((key) => Object.is(before[key], value[key]))) return false;
  for (const key of ["basis", "pivot"] as const) {
    if (
      Object.hasOwn(before, key) !== Object.hasOwn(value, key) ||
      !sameFrame(before[key], value[key])
    )
      return false;
  }
  return true;
}
