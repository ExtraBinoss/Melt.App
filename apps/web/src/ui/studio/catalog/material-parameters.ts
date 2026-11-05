import type { SpatialMaterial } from "@musart/core";

type MaterialParameter = Exclude<keyof SpatialMaterial, "preset">;
const special: Readonly<Record<string, MaterialParameter>> = {
  plastic: "clearcoat",
  ceramic: "clearcoat",
  glass: "transmission",
  fabric: "sheen",
  iridescent: "iridescence",
  emissive: "emissiveIntensity",
};

/** Two familiar controls and one relevant finish keep editing approachable. */
export function materialParameters(category: string): MaterialParameter[] {
  const finish = special[category];
  return ["roughness", "metalness", ...(finish ? [finish] : [])];
}
