import type { SpatialMaterial } from "../model";

export const SPATIAL_MATERIAL_CATEGORIES = [
  { id: "plastic" },
  { id: "metal" },
  { id: "glass" },
  { id: "ceramic" },
  { id: "stone" },
  { id: "fabric" },
  { id: "iridescent" },
  { id: "emissive" },
] as const;
export type SpatialMaterialCategory = (typeof SPATIAL_MATERIAL_CATEGORIES)[number]["id"];
interface MaterialAddition {
  id: string;
  label: string;
  baseId: string;
  variant: string;
  color: string;
  category: SpatialMaterialCategory;
  family: "metal" | "solid" | "glass" | "iridescent" | "fabric";
  settings: Partial<SpatialMaterial>;
}
type Recipe = readonly [
  baseId: string,
  variant: string,
  color: string,
  settings: Partial<SpatialMaterial>,
];
const category = (id: SpatialMaterialCategory, recipes: readonly Recipe[]): MaterialAddition[] =>
  recipes.map(([baseId, variant, color, settings]) => ({
    id: `${baseId}${variant[0]!.toUpperCase()}${variant.slice(1)}`,
    label: `${baseId.replace(/([a-z])([A-Z])/g, "$1 $2")} · ${variant}`,
    baseId,
    variant,
    color,
    category: id,
    family: ["plastic", "ceramic", "stone", "emissive"].includes(id)
      ? "solid"
      : (id as MaterialAddition["family"]),
    settings,
  }));
/** Authored physical finishes; the color is applied by the ordinary layer paint. */
export const MATERIAL_ADDITIONS: readonly MaterialAddition[] = [
  ...category("plastic", [
    ["plastic", "ivory", "#F4EEDC", { roughness: 0.16, clearcoat: 0.8 }],
    ["plastic", "coral", "#EE7668", { roughness: 0.24, clearcoat: 0.5 }],
    ["plastic", "mint", "#9ADAC8", { roughness: 0.32, clearcoat: 0.35 }],
    ["plastic", "cobalt", "#2755B6", { roughness: 0.12, clearcoat: 1 }],
    ["softPlastic", "lemon", "#E7DC68", { roughness: 0.64 }],
    ["softPlastic", "rose", "#CF899D", { roughness: 0.48, sheen: 0.15 }],
    ["softPlastic", "lavender", "#B5A2D7", { roughness: 0.72 }],
    ["rubber", "graphite", "#353B41", { roughness: 0.98 }],
    ["rubber", "terracotta", "#AB6652", { roughness: 0.88, sheen: 0.1 }],
    ["paint", "navy", "#182E50", { roughness: 0.36, clearcoat: 0.65 }],
    ["paint", "sage", "#98A895", { roughness: 0.58, clearcoat: 0.2 }],
    [
      "carPaint",
      "cherry",
      "#8E162D",
      { metalness: 0.65, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.03 },
    ],
    ["carPaint", "teal", "#146B70", { metalness: 0.72, roughness: 0.25, clearcoat: 1 }],
  ]),
  ...category("metal", [
    ["chrome", "ivory", "#EBE6DC", { metalness: 1, roughness: 0.025 }],
    ["gold", "coral", "#DAA282", { metalness: 1, roughness: 0.12 }],
    ["copper", "mint", "#80A491", { metalness: 0.86, roughness: 0.68 }],
    ["titanium", "cobalt", "#546EA2", { metalness: 1, roughness: 0.2, clearcoat: 0.45 }],
    ["gold", "lemon", "#D3BC60", { metalness: 1, roughness: 0.42 }],
    ["roseGold", "rose", "#BF7E91", { metalness: 1, roughness: 0.3 }],
    ["titanium", "lavender", "#8C84B1", { metalness: 1, roughness: 0.34 }],
    ["brushedAluminium", "graphite", "#454B55", { metalness: 1, roughness: 0.58 }],
    ["copper", "terracotta", "#9A5A3B", { metalness: 1, roughness: 0.56 }],
    ["titanium", "navy", "#26334C", { metalness: 1, roughness: 0.11 }],
    ["brass", "sage", "#8D9361", { metalness: 1, roughness: 0.72 }],
    ["aluminium", "cherry", "#8D3845", { metalness: 1, roughness: 0.38, clearcoat: 0.5 }],
    ["aluminium", "teal", "#368E94", { metalness: 1, roughness: 0.46 }],
  ]),
  ...category("glass", [
    ["glass", "ivory", "#F9F0D9", { transmission: 1, roughness: 0.01, ior: 1.52, opacity: 0.58 }],
    [
      "glass",
      "coral",
      "#EEA89F",
      { transmission: 0.94, roughness: 0.04, ior: 1.57, opacity: 0.65 },
    ],
    ["glass", "mint", "#A4DFCE", { transmission: 0.98, roughness: 0.06, ior: 1.48, opacity: 0.64 }],
    [
      "glass",
      "cobalt",
      "#416CC5",
      { transmission: 0.88, roughness: 0.03, ior: 1.7, opacity: 0.72 },
    ],
    [
      "amberGlass",
      "lemon",
      "#E3D373",
      { transmission: 0.91, roughness: 0.08, ior: 1.62, opacity: 0.68 },
    ],
    ["glass", "rose", "#DD9BB7", { transmission: 0.95, roughness: 0.12, ior: 1.53, opacity: 0.64 }],
    [
      "frostedGlass",
      "lavender",
      "#C0B4DF",
      { transmission: 0.72, roughness: 0.58, ior: 1.5, opacity: 0.75 },
    ],
    [
      "smokedGlass",
      "graphite",
      "#353F4C",
      { transmission: 0.68, roughness: 0.09, ior: 1.62, opacity: 0.8 },
    ],
    [
      "amberGlass",
      "terracotta",
      "#BC734C",
      { transmission: 0.84, roughness: 0.16, ior: 1.55, opacity: 0.7 },
    ],
    [
      "smokedGlass",
      "navy",
      "#253A65",
      { transmission: 0.77, roughness: 0.25, ior: 1.58, opacity: 0.73 },
    ],
    [
      "frostedGlass",
      "sage",
      "#B2C8AD",
      { transmission: 0.78, roughness: 0.42, ior: 1.46, opacity: 0.68 },
    ],
    [
      "glass",
      "cherry",
      "#B64F68",
      { transmission: 0.86, roughness: 0.02, ior: 1.76, opacity: 0.74 },
    ],
    ["ice", "teal", "#A1DEE1", { transmission: 0.88, roughness: 0.22, ior: 1.31, opacity: 0.69 }],
  ]),
  ...category("ceramic", [
    ["porcelain", "ivory", "#FFF5DE", { roughness: 0.08, clearcoat: 1 }],
    ["ceramic", "coral", "#DC796A", { roughness: 0.24, clearcoat: 0.8 }],
    ["ceramic", "mint", "#B3DBCA", { roughness: 0.34, clearcoat: 0.6 }],
    ["ceramic", "cobalt", "#204C94", { roughness: 0.1, clearcoat: 1 }],
    ["ceramic", "lemon", "#D8C977", { roughness: 0.46, clearcoat: 0.4 }],
    ["porcelain", "rose", "#E4B6B5", { roughness: 0.18, clearcoat: 0.9 }],
    ["ceramic", "lavender", "#A8A0BF", { roughness: 0.52, clearcoat: 0.3 }],
    ["clay", "graphite", "#383B39", { roughness: 0.96 }],
    ["clay", "terracotta", "#B56345", { roughness: 1 }],
    ["ceramic", "navy", "#293A51", { roughness: 0.22, clearcoat: 0.85 }],
    ["clay", "sage", "#98A38B", { roughness: 0.84 }],
    ["ceramic", "cherry", "#7F3540", { roughness: 0.14, clearcoat: 1 }],
    ["ceramic", "teal", "#377E7E", { roughness: 0.38, clearcoat: 0.65 }],
  ]),
  ...category("stone", [
    ["stone", "ivory", "#DAD0B7", { roughness: 0.78 }],
    ["stone", "coral", "#C39185", { roughness: 0.42, clearcoat: 0.15 }],
    ["stone", "mint", "#8BADA0", { roughness: 0.26, clearcoat: 0.5 }],
    ["stone", "cobalt", "#4C6079", { roughness: 0.62 }],
    ["stone", "lemon", "#BCAF78", { roughness: 0.91 }],
    ["stone", "rose", "#B29C9E", { roughness: 0.31, clearcoat: 0.3 }],
    ["stone", "lavender", "#9691A6", { roughness: 0.67 }],
    ["stone", "graphite", "#333735", { roughness: 0.18, clearcoat: 0.6 }],
    ["stone", "terracotta", "#A4785D", { roughness: 0.97 }],
    ["stone", "navy", "#394451", { roughness: 0.53 }],
    ["stone", "sage", "#7B8672", { roughness: 0.86 }],
    ["stone", "cherry", "#72484C", { roughness: 0.37, clearcoat: 0.2 }],
    ["concrete", "teal", "#789C98", { roughness: 0.94 }],
  ]),
  ...category("fabric", [
    ["satin", "ivory", "#E9DEC8", { roughness: 0.4, sheen: 0.9 }],
    ["satin", "coral", "#CC8679", { roughness: 0.46, sheen: 0.8 }],
    ["velvet", "mint", "#8DAE9D", { roughness: 0.96, sheen: 1 }],
    ["velvet", "cobalt", "#2D4A80", { roughness: 0.88, sheen: 0.95 }],
    ["satin", "lemon", "#C3B675", { roughness: 0.58, sheen: 0.75 }],
    ["velvet", "rose", "#A96F86", { roughness: 1, sheen: 1 }],
    ["satin", "lavender", "#9D8AAE", { roughness: 0.32, sheen: 1 }],
    ["velvet", "graphite", "#32343C", { roughness: 0.98, sheen: 0.8 }],
    ["velvet", "terracotta", "#A96B53", { roughness: 0.84, sheen: 0.9 }],
    ["satin", "navy", "#28364F", { roughness: 0.38, sheen: 0.88 }],
    ["velvet", "sage", "#7B8B6B", { roughness: 0.92, sheen: 0.7 }],
    ["velvet", "cherry", "#732D45", { roughness: 1, sheen: 0.98 }],
    ["satin", "teal", "#377F83", { roughness: 0.52, sheen: 1 }],
  ]),
  ...category("iridescent", [
    ["pearl", "ivory", "#F7EFDA", { roughness: 0.15, iridescence: 0.5, clearcoat: 1 }],
    ["pearl", "coral", "#EBB8AC", { roughness: 0.28, iridescence: 0.65, clearcoat: 0.8 }],
    ["iridescent", "mint", "#A0D9C3", { metalness: 0.5, roughness: 0.18, iridescence: 1 }],
    ["holographic", "cobalt", "#5473BE", { metalness: 1, roughness: 0.08, iridescence: 0.9 }],
    ["pearl", "lemon", "#EBDDAB", { roughness: 0.32, iridescence: 0.7, clearcoat: 1 }],
    ["iridescent", "rose", "#D5A0B9", { metalness: 0.65, roughness: 0.22, iridescence: 1 }],
    [
      "soapBubble",
      "lavender",
      "#DDD0EF",
      { transmission: 0.9, roughness: 0.025, iridescence: 1, opacity: 0.5 },
    ],
    ["holographic", "graphite", "#4D5060", { metalness: 1, roughness: 0.12, iridescence: 1 }],
    ["iridescent", "terracotta", "#C28A6E", { metalness: 0.8, roughness: 0.4, iridescence: 0.85 }],
    ["iridescent", "navy", "#3F4E7D", { metalness: 0.9, roughness: 0.14, iridescence: 1 }],
    ["pearl", "sage", "#BFCCAE", { roughness: 0.45, iridescence: 0.6, clearcoat: 0.8 }],
    ["holographic", "cherry", "#A4618B", { metalness: 1, roughness: 0.2, iridescence: 1 }],
    [
      "soapBubble",
      "teal",
      "#B5E1DA",
      { transmission: 0.82, roughness: 0.08, iridescence: 1, opacity: 0.57 },
    ],
  ]),
  ...category("emissive", [
    ["emissive", "ivory", "#FFF4D9", { roughness: 0.3, emissiveIntensity: 0.8 }],
    ["emissive", "coral", "#FF8272", { roughness: 0.5, emissiveIntensity: 1.4 }],
    ["emissive", "mint", "#7EF6C9", { roughness: 0.24, emissiveIntensity: 1.8 }],
    ["emissive", "cobalt", "#4C72FF", { roughness: 0.18, emissiveIntensity: 2.8 }],
    ["emissive", "lemon", "#FFEB63", { roughness: 0.42, emissiveIntensity: 1.2 }],
    ["emissive", "rose", "#FF87C3", { roughness: 0.36, emissiveIntensity: 2 }],
    ["emissive", "lavender", "#C1A2FF", { roughness: 0.6, emissiveIntensity: 1.6 }],
    ["emissive", "graphite", "#8E9BAB", { roughness: 0.75, emissiveIntensity: 0.45 }],
    ["emissive", "terracotta", "#FF9B51", { roughness: 0.32, emissiveIntensity: 2.2 }],
    ["emissive", "navy", "#5369BC", { roughness: 0.65, emissiveIntensity: 0.9 }],
    ["emissive", "sage", "#C7DF92", { roughness: 0.55, emissiveIntensity: 1 }],
    ["emissive", "cherry", "#FF4566", { roughness: 0.2, emissiveIntensity: 2.5 }],
    ["emissive", "teal", "#4EF1E4", { roughness: 0.28, emissiveIntensity: 1.9 }],
  ]),
];
