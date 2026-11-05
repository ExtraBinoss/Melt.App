import type { SourceScene } from "./primitives";
import {
  ink,
  paper,
  rect,
  oval,
  label,
  vector,
  paint,
  field,
  sphere,
  ring,
  face,
  fern,
} from "./primitives";

export const TEXTURE_SCENES = {
  terminal: {
    title: "Cursor command screen",
    background: "#08120c",
    layers: () => [
      rect(0, 0, 200, 148, "#04170e"),
      label(">_", 16, 10, 65, "#c9ff82"),
      label("HELLO", 18, 85, 31, "#92e6ac"),
    ],
    effect: { time: 1.2, settings: { progress: 0.82, columns: 20, rows: 6, cursor: "block" } },
  },
  "torn-edges": {
    title: "Torn editorial paper",
    background: "#263642",
    layers: () => [
      rect(12, 4, 176, 140, paper),
      label("TEAR", 27, 28, 49, ink),
      rect(30, 96, 138, 4, ink),
      rect(30, 107, 96, 4, ink),
    ],
    effect: { settings: { technique: "paper", tearWidth: 12, roughness: 0.65, sourceColor: 1 } },
  },
  "ink-bleed": {
    title: "Bleeding ink letterpress",
    background: "#e2d9c8",
    layers: () => [
      rect(0, 0, 200, 148, paper),
      label("ink", 13, 10, 112, "#181318"),
      oval(155, 112, 13, 13, ink),
      oval(169, 105, 7, 7, ink),
    ],
    effect: { settings: { radius: 3, density: 1.5, roughness: 0.85 } },
  },
  "pixel-sort": {
    title: "Chromatic skyline streaks",
    background: "#11151e",
    layers: () => [
      rect(0, 0, 200, 148, "#090b16"),
      ...Array.from({ length: 16 }, (_, i) =>
        rect(i * 13, 35 + ((i * 41) % 75), 9, 105, "#f56075", {
          fillGradient: paint(["#ffe399", "#e85b80", "#232b7d"]),
        }),
      ),
      rect(0, 124, 200, 7, "#efd5a0"),
    ],
    effect: { settings: { axis: "vertical", window: "64", cellSize: 2 } },
  },
  "edge-detect": {
    title: "Architectural blueprint",
    background: "#111f42",
    layers: () => [
      field(["#173758", "#4887ba"]),
      rect(36, 34, 122, 91, "#97bac8"),
      vector("M17 53L97 5L183 53Z", "#cfdbd5"),
      rect(56, 71, 25, 54, "#39667c"),
      oval(109, 63, 30, 30, "#30566c"),
      rect(0, 135, 200, 5, "#deeadf"),
    ],
  },
  dither: {
    title: "Dithered metallic sphere",
    background: "#202b32",
    layers: () => [
      field(["#768f99", "#1c2635"]),
      oval(30, 117, 150, 17, "#0c182a"),
      sphere(49, 14, 115, ["#f1ecce", "#7b9b95", "#172c50"]),
    ],
    effect: { scale: 3, levels: 4, color: true },
  },
  ascii: {
    title: "Character-encoded face",
    background: "#10151a",
    layers: face,
    effect: {
      scale: 5,
      settings: { palette: "solid", foreground: "#a8e3c2", background: "#091611", contrast: 1.15 },
    },
  },
  grain: {
    title: "Grained terracotta paper fold",
    background: "#a45a4d",
    layers: () => [
      field(["#edc18e", "#b26350", "#623d50"]),
      vector("M0 148Q74 8 200 35V148Z", "#c0755b", { fillGradient: paint(["#e6b17a", "#89505a"]) }),
    ],
    effect: { amount: 0.38, scale: 2, color: false },
  },
  halftone: {
    title: "CMYK screened orb",
    background: "#e4decf",
    layers: () => [
      rect(0, 0, 200, 148, paper),
      sphere(29, 4, 142, ["#fff5b5", "#e67770", "#6b74b3", "#13274b"]),
    ],
    effect: {
      scale: 5,
      color: true,
      settings: { pattern: "color-screen", dotSize: 0.92, softness: 0.2 },
    },
  },
  noise: {
    title: "Procedural mineral cloud",
    background: "#323641",
    layers: () => [vector("M68 4L152 13L191 66L159 133L65 145L11 89L25 31Z", "#b4a6bb")],
    effect: {
      scale: 36,
      color: true,
      settings: { algorithm: "ridged", contrast: 1.65, octaves: 4 },
    },
  },
  circle: {
    title: "Circular ink mosaic eye",
    background: "#e9d7c8",
    layers: () => [
      rect(0, 0, 200, 148, "#eeeeee"),
      vector("M6 75Q100 -15 194 75Q100 164 6 75Z", "#858585"),
      sphere(51, 25, 99, ["#dddddd", "#333333"]),
      oval(81, 55, 38, 38, "#101010"),
    ],
    effect: { settings: { spacing: 7, foreground: "#7d354a", background: "#f5dfc9", gamma: 0.9 } },
  },
  cyanotype: {
    title: "Cyanotype fern print",
    background: "#193d61",
    layers: fern,
    effect: { settings: { edgeWidth: 10, edgeFade: 0.1, paperGrain: 0.06 } },
  },
  crt: {
    title: "Cathode ray broadcast test",
    background: "#18191e",
    layers: () => [
      ...["#d7d6ad", "#b7c65d", "#65a8a9", "#5da66e", "#b17791", "#b45d4a", "#4a5191"].map(
        (color, i) => rect(i * 29, 0, 29, 148, color),
      ),
      ring(40, 14, 120, 120, "#e5e7d6", 4),
      rect(0, 104, 200, 29, "#11131c"),
      label("TV", 75, 100, 25, "#e5e7d6"),
    ],
    effect: {
      settings: { scanlinePitch: 4, scanlineStrength: 0.45, curvatureX: 0.16, curvatureY: 0.12 },
    },
  },
  "bit-dither": {
    title: "One-bit lunar landscape",
    background: "#d5ddbb",
    layers: () => [
      field(["#eeeeee", "#858585"]),
      sphere(103, 7, 62, ["#ffffff", "#6e6e6e"]),
      vector("M-10 148L51 54L102 116L139 83L210 148Z", "#686868"),
      vector("M0 148L45 115L92 148Z", "#222222"),
    ],
    effect: {
      scale: 3,
      settings: { method: "bayer4", foreground: "#23322a", background: "#e6e8c2" },
    },
  },
  receipt: {
    title: "Thermal register receipt",
    background: "#6f6b63",
    layers: () => [
      rect(36, 0, 128, 148, "#f3ecdc"),
      label("MELT", 53, 8, 30, "#272724"),
      ...[0, 1, 2, 3].map((i) => rect(49, 53 + i * 15, 75 - i * 6, 4, "#55554e")),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => rect(53 + i * 12, 120, i % 2 ? 3 : 6, 18, "#232420")),
      rect(133, 52, 14, 53, "#8b897c"),
    ],
    effect: { scale: 1.5, settings: { contrast: 1.4, paperTexture: 0.08 } },
  },
  "pink-phosphor": {
    title: "Phosphor wireframe pyramid",
    background: "#17101d",
    layers: () => [
      rect(0, 0, 200, 148, "#050509"),
      vector(
        "M100 8L180 127L25 127ZM100 8L100 127M63 64H138M45 93H159M100 8L65 127M100 8L136 127",
        "transparent",
        { stroke: "#dadada", strokeWidth: 3 },
      ),
      oval(19, 22, 5, 5, "#ffffff"),
      oval(169, 44, 4, 4, "#ffffff"),
    ],
    effect: { scale: 2, settings: { glow: 0.48, scanlines: 0.3, glowRadius: 2 } },
  },
} satisfies Record<string, SourceScene>;
