import type { SpatialMaterial } from "./model";
import { MATERIAL_ADDITIONS } from "./catalog/materials";
export { SPATIAL_MATERIAL_CATEGORIES } from "./catalog/materials";
export type { SpatialMaterialCategory } from "./catalog/materials";
import type { SpatialMaterialCategory } from "./catalog/materials";
export interface SpatialMaterialPreset {
  id: string;
  color: string;
  label: string;
  baseId: string;
  variant: string | null;
  category: SpatialMaterialCategory;
  family: "metal" | "solid" | "glass" | "iridescent" | "fabric";
  settings: SpatialMaterial;
}
const base: SpatialMaterial = {
  preset: "plastic",
  metalness: 0,
  roughness: 0.3,
  transmission: 0,
  ior: 1.5,
  clearcoat: 0,
  clearcoatRoughness: 0.1,
  sheen: 0,
  iridescence: 0,
  emissiveIntensity: 0,
  opacity: 1,
};
const preset = (
  id: string,
  color: string,
  family: SpatialMaterialPreset["family"],
  settings: Partial<SpatialMaterial>,
): SpatialMaterialPreset =>
  Object.freeze({
    id,
    baseId: id,
    variant: null,
    label: id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase()),
    category: categoryFor(id, family),
    color,
    family,
    settings: Object.freeze({ ...base, ...settings, preset: id }),
  });
function categoryFor(id: string, family: SpatialMaterialPreset["family"]): SpatialMaterialCategory {
  if (["porcelain", "ceramic", "clay"].includes(id)) return "ceramic";
  if (["concrete", "stone"].includes(id)) return "stone";
  if (id === "emissive") return "emissive";
  return family === "solid" ? "plastic" : family;
}
export const SPATIAL_MATERIALS: readonly SpatialMaterialPreset[] = Object.freeze([
  preset("chrome", "#ECEFF5", "metal", { metalness: 1, roughness: 0.06 }),
  preset("aluminium", "#CCD2DC", "metal", { metalness: 1, roughness: 0.25 }),
  preset("brushedAluminium", "#BAC4D2", "metal", { metalness: 1, roughness: 0.48 }),
  preset("gold", "#EBC274", "metal", { metalness: 1, roughness: 0.18 }),
  preset("roseGold", "#DBA69C", "metal", { metalness: 1, roughness: 0.23 }),
  preset("copper", "#D18A65", "metal", { metalness: 1, roughness: 0.28 }),
  preset("brass", "#AD944F", "metal", { metalness: 1, roughness: 0.38 }),
  preset("titanium", "#646B82", "metal", { metalness: 1, roughness: 0.2 }),
  preset("plastic", "#8757FF", "solid", { roughness: 0.22, clearcoat: 0.45 }),
  preset("softPlastic", "#E9A6BC", "solid", { roughness: 0.55 }),
  preset("rubber", "#252833", "solid", { roughness: 0.92 }),
  preset("porcelain", "#FFF7ED", "solid", { roughness: 0.12, clearcoat: 0.8 }),
  preset("ceramic", "#308D91", "solid", { roughness: 0.27, clearcoat: 0.65 }),
  preset("clay", "#BB7357", "solid", { roughness: 1 }),
  preset("concrete", "#95938C", "solid", { roughness: 0.95 }),
  preset("stone", "#6A786D", "solid", { roughness: 0.75 }),
  preset("glass", "#FFFFFF", "glass", { transmission: 1, roughness: 0.02, opacity: 0.55 }),
  preset("smokedGlass", "#59636F", "glass", { transmission: 0.85, roughness: 0.06, opacity: 0.7 }),
  preset("amberGlass", "#E7A740", "glass", { transmission: 0.9, roughness: 0.04, opacity: 0.7 }),
  preset("frostedGlass", "#D4E3E9", "glass", { transmission: 0.8, roughness: 0.5, opacity: 0.7 }),
  preset("ice", "#B8EAF5", "glass", {
    transmission: 0.85,
    roughness: 0.17,
    ior: 1.31,
    opacity: 0.72,
  }),
  preset("pearl", "#F2E9EF", "iridescent", { roughness: 0.2, iridescence: 0.55, clearcoat: 1 }),
  preset("iridescent", "#C8BAFF", "iridescent", {
    metalness: 0.65,
    roughness: 0.17,
    iridescence: 1,
  }),
  preset("holographic", "#E6EFF5", "iridescent", { metalness: 1, roughness: 0.08, iridescence: 1 }),
  preset("soapBubble", "#F8F4FF", "iridescent", {
    transmission: 0.95,
    roughness: 0.02,
    iridescence: 1,
    opacity: 0.4,
  }),
  preset("velvet", "#622B69", "fabric", { roughness: 1, sheen: 1 }),
  preset("satin", "#C89B88", "fabric", { roughness: 0.5, sheen: 0.8 }),
  preset("paint", "#ED6154", "solid", { roughness: 0.32, clearcoat: 0.5 }),
  preset("carPaint", "#215CB5", "solid", {
    metalness: 0.55,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  }),
  preset("emissive", "#A776FF", "solid", { roughness: 0.5, emissiveIntensity: 1.5 }),
  ...MATERIAL_ADDITIONS.map((entry) =>
    Object.freeze({
      ...preset(entry.id, entry.color, entry.family, entry.settings),
      baseId: entry.baseId,
      variant: entry.variant,
      category: entry.category,
      label: entry.label,
    }),
  ),
]);
export function spatialMaterial(id: string): SpatialMaterialPreset {
  const value = SPATIAL_MATERIALS.find((item) => item.id === id);
  if (!value) throw new RangeError("Unknown 3D material preset");
  return value;
}
