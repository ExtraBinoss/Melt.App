import type { SourceScene } from "./primitives";
import { rect, oval, label, vector, field, sphere, ring, checker } from "./primitives";

export const SPACE_SCENES = {
  feather: {
    title: "Soft iris aperture",
    background: "#171224",
    layers: () => [
      field(["#e9baf5", "#8b6ad3", "#261849"], true),
      ring(42, 20, 116, 108, "#ffe7bd", 16),
      sphere(67, 40, 66, ["#fff4d7", "#df9cbb", "#694085"]),
    ],
    effect: { settings: { radius: 0.46, softness: 0.4 } },
  },
  liquify: {
    title: "Twisted ribbon folds",
    background: "#252030",
    layers: () => [
      field(["#e7d4b6", "#f5aa7b"]),
      ...[0, 1, 2, 3, 4].map((i) =>
        vector(
          `M-20 ${i * 32 - 35}Q80 ${i * 32 + 75} 220 ${i * 32 - 10}L220 ${i * 32 + 10}Q80 ${i * 32 + 95} -20 ${i * 32 - 15}Z`,
          ["#702754", "#ed4878", "#ed872c", "#64407f", "#8d2444"][i]!,
        ),
      ),
    ],
    effect: {
      liquify: [
        {
          x: 0.5,
          y: 0.5,
          dx: 0.12,
          dy: -0.06,
          radius: 0.48,
          strength: 0.95,
          hardness: 0.3,
          mode: "twirl-cw",
        },
      ],
    },
  },
  "window-trails": {
    title: "Cascading desktop windows",
    background: "#17192e",
    layers: () => [
      field(["#272a64", "#6b4ba0"]),
      sphere(62, 28, 84, ["#f0ffd3", "#a7d57a", "#42676a"]),
      ring(35, 63, 128, 30, "#e6f3c0", 4, -18),
    ],
    effect: {
      time: 2.8,
      settings: {
        count: 7,
        width: 83,
        height: 64,
        titleHeight: 9,
        border: 1,
        entranceDelay: 0,
        radiusX: 0.26,
        radiusY: 0.25,
        showSource: false,
      },
    },
  },
  bevel: {
    title: "Embossed relief lettering",
    background: "#bc9b89",
    layers: () => [label("B", 36, -14, 160, "#d6b59f", { width: 140, height: 160 })],
    effect: { settings: { size: 7, depth: 7, gloss: 18, ambient: 0.62 } },
  },
  displace: {
    title: "Warped checker sail",
    background: "#191c21",
    layers: () => checker(20, ["#e4edab", "#313e6c"]),
    effect: {
      inputs: { map: "catalog-displacement" },
      settings: { strengthX: 28, strengthY: 17, dispersion: 0.18 },
    },
  },
  blur: {
    title: "Defocused prismatic comet",
    background: "#171223",
    layers: () => [
      oval(12, 24, 173, 33, "#db6e65", { rotation: -32 }),
      oval(31, 60, 147, 27, "#e8bf56", { rotation: -32 }),
      oval(56, 96, 125, 27, "#b187df", { rotation: -32 }),
      sphere(111, 10, 57, ["#fff2cc", "#e38eab"]),
    ],
    effect: { scale: 7 },
  },
  shadow: {
    title: "Floating gallery card",
    background: "#c5b9a3",
    layers: () => [
      rect(36, 10, 127, 121, "#f6f1de", { radius: 7, rotation: -9 }),
      oval(72, 30, 57, 57, "#ca5c48"),
      rect(64, 99, 70, 5, "#8c796b", { rotation: -9 }),
    ],
    effect: { settings: { offsetX: 13, offsetY: 13, radius: 9, shadowColor: "#302c29" } },
  },
  vignette: {
    title: "Darkened gallery arch",
    background: "#24282d",
    layers: () => [
      field(["#9faaa6", "#424d59"]),
      rect(55, 38, 90, 110, "#dbd3b8", { radius: 43 }),
      rect(55, 84, 90, 64, "#b9b798"),
      oval(84, 59, 32, 32, "#ece8ca"),
      vector("M55 148L145 148L127 114L74 114Z", "#888e80"),
    ],
    effect: { amount: 0.83, scale: 2 },
  },
  ripple: {
    title: "Disturbed concentric water rings",
    background: "#163d4c",
    layers: () => [
      field(["#87beb2", "#195168"]),
      ...Array.from({ length: 7 }, (_, i) =>
        ring(
          4 + i * 14,
          -20 + i * 12,
          192 - i * 28,
          188 - i * 24,
          i % 2 ? "#ccebd3" : "#153f52",
          5,
        ),
      ),
    ],
    effect: {
      time: 0.9,
      settings: {
        innerRadius: 0,
        radius: 150,
        feather: 20,
        amplitude: 10,
        wavelength: 29,
        dispersion: 0.2,
      },
    },
  },
  shatter: {
    title: "Prismatic shattered glass",
    background: "#18242e",
    layers: () => [
      field(["#6ed1c2", "#6a71c1", "#eac0b0"]),
      vector("M100 8L178 64L155 130L47 131L21 58Z", "#b8e9df", {
        stroke: "#e6fff2",
        strokeWidth: 3,
      }),
      vector("M100 8L92 89L21 58ZM92 89L155 130L178 64Z", "#6f9aa9"),
    ],
    effect: {
      scale: 45,
      settings: { spokes: 12, displacement: 10, crackWidth: 1.5, dispersion: 0.35 },
    },
  },
  flashlight: {
    title: "Spotlit chess queen",
    background: "#1a2028",
    layers: () => [
      field(["#868d92", "#373d45"]),
      vector(
        "M46 123L58 104L68 54L48 27L81 42L99 17L118 42L152 27L131 54L140 104L154 123Z",
        "#c6c8b9",
      ),
      rect(44, 124, 112, 11, "#adaf9f", { radius: 3 }),
    ],
    effect: { settings: { radius: 0.49, softness: 0.45, ambient: 0.04, intensity: 1.7 } },
  },
  datamosh: {
    title: "Corrupted racing poster",
    background: "#20222f",
    layers: () => [
      rect(0, 0, 200, 148, "#db683e"),
      rect(-30, 21, 260, 26, "#efc447", { rotation: -25 }),
      label("33", 27, 8, 123, "#e9e8c2"),
      rect(0, 127, 200, 8, "#1c4057"),
    ],
    effect: {
      time: 1.2,
      settings: { blockSize: 14, density: 0.55, displacement: 25, chromaShift: 4 },
    },
  },
  transition: {
    title: "Diagonal graphic reveal",
    background: "#7d86ae",
    layers: () => [
      field(["#f0bc7b", "#d46e7e"]),
      oval(42, 12, 118, 118, "#e8dfb3"),
      rect(68, 39, 64, 64, "#66548d", { rotation: 45 }),
      oval(82, 53, 36, 36, "#f8edc9"),
    ],
    effect: { settings: { style: "diagonal-wipe", progress: 0.64 } },
  },
} satisfies Record<string, SourceScene>;
