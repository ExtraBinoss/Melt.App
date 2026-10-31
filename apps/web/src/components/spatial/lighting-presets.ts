import { createSpatialLight, type SpatialLight } from "@musart/core";
export const LIGHTING_RIGS = ["studio", "soft", "rim", "neon", "dramatic"] as const;
export function lightingRig(id: string): SpatialLight[] {
  const light = (x: number, y: number, z: number, intensity: number, color = "#FFFFFF") => ({
    ...createSpatialLight(),
    id: crypto.randomUUID(),
    x,
    y,
    z,
    intensity,
    color,
    castShadow: false,
  });
  if (id === "soft") return [light(-3, 5, 5, 2), light(4, 2, 4, 1.2)];
  if (id === "rim") return [light(-2, 3, -4, 4), light(1, 2, 5, 0.6)];
  if (id === "neon") return [light(-3, 2, 3, 3, "#FF64DB"), light(4, 1, 1, 3, "#61C7FF")];
  if (id === "dramatic")
    return [{ ...light(-4, 5, 3, 4, "#FFD7AD"), castShadow: true }, light(4, 0, -3, 1, "#8DAAFF")];
  return [{ ...light(-3, 4, 5, 3), castShadow: true }, light(4, 1, 3, 1.2), light(1, 3, -4, 2)];
}
