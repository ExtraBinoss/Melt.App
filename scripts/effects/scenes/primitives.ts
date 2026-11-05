/** Code-native portable artwork helpers; no canvas, DOM or GPU resources. */
import {
  createLayer,
  type FillGradient,
  type Layer,
  type LayerKind,
  type Effect,
} from "../../../packages/core/src/index";
export interface SourceScene {
  title: string;
  background: string;
  layers: () => Layer[];
  effect?: Partial<Effect>;
}
export const ink = "#15171d";
export const paper = "#f6efdf";
export function node(kind: LayerKind, patch: Partial<Layer>): Layer {
  return createLayer(kind, { id: "motif", x: 0, y: 0, width: 200, height: 148, ...patch });
}
export const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  patch: Partial<Layer> = {},
) => node("rectangle", { x, y, width, height, fill, ...patch });
export const oval = (
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  patch: Partial<Layer> = {},
) => node("ellipse", { x, y, width, height, fill, ...patch });
export const label = (
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  patch: Partial<Layer> = {},
) =>
  node("text", { text, x, y, fontSize, fontFamily: "sans-serif", fontWeight: 900, fill, ...patch });
export const vector = (path: string, fill: string, patch: Partial<Layer> = {}) =>
  node("vector", { fill, vector: { viewBox: "0 0 200 148", path }, ...patch });
export function paint(colors: string[], radial = false, angle = 35): FillGradient {
  return {
    kind: radial ? "radial" : "linear",
    angle,
    ...(radial ? { centerX: 0.33, centerY: 0.28, radius: 0.9 } : {}),
    stops: colors.map((color, index) => ({ color, offset: index / (colors.length - 1) })),
  };
}
export const field = (colors: string[], radial = false) =>
  rect(0, 0, 200, 148, colors[0]!, { fillGradient: paint(colors, radial) });
export const sphere = (x: number, y: number, size: number, colors: string[]) =>
  oval(x, y, size, size, colors[0]!, { fillGradient: paint(colors, true) });
export const ring = (
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  strokeWidth = 5,
  rotation = 0,
) => oval(x, y, width, height, "transparent", { stroke: color, strokeWidth, rotation });
export function checker(size: number, colors: [string, string]): Layer[] {
  return Array.from({ length: Math.ceil(148 / size) }, (_, y) =>
    Array.from({ length: Math.ceil(200 / size) }, (_, x) =>
      rect(x * size, y * size, size, size, colors[(x + y) % 2]!),
    ),
  ).flat();
}
export function face(): Layer[] {
  return [
    field(["#0c0d12", "#303742"]),
    oval(53, 7, 98, 136, "#d8d9d4", {
      fillGradient: paint(["#ffffff", "#9c9c9c", "#313131"], true),
    }),
    oval(68, 54, 20, 8, "#171717"),
    oval(116, 54, 20, 8, "#242424"),
    vector("M102 54L113 98L92 95Z", "#666666"),
    oval(83, 115, 44, 8, "#202020"),
    rect(49, 20, 8, 67, "#555555"),
  ];
}
export function fern(): Layer[] {
  return [
    rect(0, 0, 200, 148, paper),
    vector("M52 148Q80 60 146 2", "transparent", { stroke: ink, strokeWidth: 3 }),
    ...Array.from({ length: 9 }, (_, i) => {
      const x = 66 + i * 7,
        y = 125 - i * 13;
      return [
        oval(x - 32, y - 10, 42 - i * 2, 14, "#657464", { rotation: 35 }),
        oval(x + 3, y - 15, 46 - i * 2, 15, "#303f35", { rotation: -38 }),
      ];
    }).flat(),
  ];
}
