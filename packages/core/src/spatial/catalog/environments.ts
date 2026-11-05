export const SPATIAL_ENVIRONMENT_CATEGORIES = [
  { id: "studio" },
  { id: "daylight" },
  { id: "interior" },
  { id: "night" },
  { id: "color" },
] as const;
export type SpatialEnvironmentCategory = (typeof SPATIAL_ENVIRONMENT_CATEGORIES)[number]["id"];
export interface SpatialEnvironmentPanel {
  position: readonly [number, number, number];
  size: readonly [number, number];
  color: string;
  intensity: number;
}
export interface SpatialEnvironmentPreset {
  id: string;
  label: string;
  baseId: string;
  variant: string | null;
  category: SpatialEnvironmentCategory;
  background: string;
  roomColor: string;
  roomSize: readonly [number, number, number];
  panels: readonly SpatialEnvironmentPanel[];
}
type Panel = readonly [
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  intensity: number,
];
interface Layout {
  id: string;
  room: readonly [number, number, number];
  panels: readonly Panel[];
}
/** Position, size and relative radiance describe ten different photographic rigs. */
const layouts: readonly Layout[] = [
  {
    id: "side",
    room: [12, 9, 14],
    panels: [
      [-4, 2, 2, 3, 5, 7],
      [4, 1, -3, 2, 3, 2],
    ],
  },
  {
    id: "split",
    room: [14, 10, 12],
    panels: [
      [-5, 0, 1, 1, 7, 9],
      [5, 2, -1, 1, 5, 5],
    ],
  },
  {
    id: "ceiling",
    room: [12, 8, 12],
    panels: [
      [0, 3.8, 0, 7, 5, 5],
      [0, 1, -5, 4, 1, 1],
    ],
  },
  {
    id: "rim",
    room: [14, 10, 16],
    panels: [
      [-3, 2, -5, 2, 5, 10],
      [3, 1, -5, 2, 4, 8],
      [0, 0, 6, 4, 3, 0.8],
    ],
  },
  {
    id: "strip",
    room: [10, 10, 14],
    panels: [
      [-3, 2, 3, 0.45, 7, 12],
      [2, 3, -3, 0.6, 6, 7],
      [0, 4, 0, 5, 0.5, 5],
    ],
  },
  {
    id: "window",
    room: [16, 12, 14],
    panels: [
      [-6, 2, 1, 4, 7, 6],
      [-6, 2, -4, 2, 7, 4],
      [5, 1, 4, 3, 4, 0.7],
    ],
  },
  {
    id: "cross",
    room: [14, 12, 14],
    panels: [
      [-4, 3, 4, 2, 5, 6],
      [4, 3, -4, 2, 5, 6],
      [0, 5, 0, 4, 4, 2],
    ],
  },
  {
    id: "tunnel",
    room: [8, 8, 22],
    panels: [
      [-3, 2, -7, 1, 5, 8],
      [3, 2, -2, 1, 5, 6],
      [-3, 2, 4, 1, 5, 4],
      [0, 3, 8, 3, 1, 3],
    ],
  },
  {
    id: "halo",
    room: [16, 14, 16],
    panels: [
      [-4, 4, 0, 2, 2, 7],
      [4, 4, 0, 2, 2, 7],
      [0, 4, -4, 2, 2, 7],
      [0, 4, 4, 2, 2, 7],
    ],
  },
  {
    id: "low",
    room: [16, 8, 18],
    panels: [
      [-5, -0.8, 2, 5, 1, 8],
      [4, -1, -4, 3, 1, 5],
      [0, 3, 5, 2, 2, 0.8],
    ],
  },
];
interface Palette {
  baseId: string;
  category: SpatialEnvironmentCategory;
  room: string;
  colors: readonly string[];
  strength: number;
  elevation: number;
  stretch: number;
}
const palettes: readonly Palette[] = [
  {
    baseId: "studio",
    category: "studio",
    room: "#25272D",
    colors: ["#FFFFFF", "#D7E6FF"],
    strength: 1,
    elevation: 0,
    stretch: 1,
  },
  {
    baseId: "overcast",
    category: "daylight",
    room: "#64758B",
    colors: ["#D9EBFF", "#FFF1D6"],
    strength: 1.25,
    elevation: 1.2,
    stretch: 1.3,
  },
  {
    baseId: "gallery",
    category: "interior",
    room: "#63564A",
    colors: ["#FFE1AC", "#FFF6E5"],
    strength: 0.75,
    elevation: -0.6,
    stretch: 0.85,
  },
  {
    baseId: "night",
    category: "night",
    room: "#060A19",
    colors: ["#718DFF", "#F8B778"],
    strength: 0.45,
    elevation: -1,
    stretch: 0.7,
  },
  {
    baseId: "neon",
    category: "color",
    room: "#190B29",
    colors: ["#FF3DAD", "#3EE9FF", "#AD6BFF"],
    strength: 1.4,
    elevation: 0.5,
    stretch: 1.1,
  },
];
function build(
  id: string,
  palette: Palette,
  layout: Layout,
  variant: string | null,
): SpatialEnvironmentPreset {
  return {
    id,
    baseId: palette.baseId,
    variant,
    label: variant ? `${palette.baseId} · ${variant}` : id,
    category: palette.category,
    background: palette.room,
    roomColor: palette.room,
    roomSize: [
      layout.room[0] * palette.stretch,
      layout.room[1] + Math.abs(palette.elevation) * 2,
      layout.room[2],
    ],
    panels: layout.panels.map(([x, y, z, width, height, intensity], index) => ({
      position: [x * palette.stretch, y + palette.elevation, z],
      size: [width * palette.stretch, height],
      color: palette.colors[index % palette.colors.length]!,
      intensity: intensity * palette.strength,
    })),
  };
}
const studio = palettes[0]!,
  daylight = palettes[1]!,
  interior = palettes[2]!,
  night = palettes[3]!,
  color = palettes[4]!;
/** Legacy IDs remain portable; each now owns an actual native lighting rig. */
const legacy: SpatialEnvironmentPreset[] = [
  build("studio", studio, layouts[6]!, null),
  build("softbox", { ...studio, room: "#888A90", strength: 0.65 }, layouts[2]!, null),
  build("overcast", daylight, layouts[8]!, null),
  build(
    "sunset",
    { ...daylight, colors: ["#FF974D", "#B2A5F3"], elevation: -1.5, strength: 1.1 },
    layouts[9]!,
    null,
  ),
  build(
    "dawn",
    { ...daylight, colors: ["#FECBA6", "#BACFFF"], elevation: -0.7, strength: 0.8 },
    layouts[0]!,
    null,
  ),
  build("night", night, layouts[7]!, null),
  build("neon", color, layouts[4]!, null),
  build("warm", { ...interior, colors: ["#FFCA84", "#FFE5BA"], strength: 1 }, layouts[5]!, null),
  build("cool", { ...studio, colors: ["#B7DEFF", "#E8F1FF"], elevation: 0.7 }, layouts[1]!, null),
  build("gallery", interior, layouts[6]!, null),
  build("contrast", { ...studio, room: "#07080A", strength: 1.7 }, layouts[0]!, null),
  {
    ...build("none", studio, layouts[0]!, null),
    panels: [],
    background: "#000000",
    roomColor: "#000000",
  },
];
export const SPATIAL_ENVIRONMENT_PRESETS: readonly SpatialEnvironmentPreset[] = Object.freeze([
  ...legacy.map((preset) => ({ ...preset, baseId: preset.id })),
  ...palettes.flatMap((palette) =>
    layouts.map((layout) =>
      build(
        `${palette.baseId}${layout.id[0]!.toUpperCase()}${layout.id.slice(1)}`,
        palette,
        layout,
        layout.id,
      ),
    ),
  ),
]);
export function spatialEnvironment(id: string): SpatialEnvironmentPreset {
  const preset = SPATIAL_ENVIRONMENT_PRESETS.find((item) => item.id === id);
  if (!preset) throw new RangeError("Unknown 3D environment preset");
  return preset;
}
