import type { SourceScene } from "./primitives";
import { paper, rect, oval, vector, paint, field, sphere, ring } from "./primitives";

export const COLOR_SCENES = {
  brightness: {
    title: "Sunrise through a cloud",
    background: "#3e547b",
    layers: () => [
      field(["#587b9a", "#bfbca9"]),
      oval(75, 15, 79, 79, "#e8d89d"),
      oval(-17, 77, 151, 57, "#8999aa"),
      oval(84, 85, 139, 64, "#536d87"),
    ],
    effect: { amount: 0.63 },
  },
  contrast: {
    title: "Hard light chessboard",
    background: "#313238",
    layers: () => [
      field(["#c2c2c2", "#3c3c3c"]),
      ...[0, 1, 2, 3, 4].map((i) => rect(i * 40, 74, 40, 74, i % 2 ? "#555555" : "#a3a3a3")),
      vector("M69 109L79 82L74 61L85 34L124 16L144 47L126 62L109 57L116 81L132 109Z", "#727272"),
    ],
    effect: { amount: 0.78 },
  },
  grayscale: {
    title: "Monochrome botanical study",
    background: "#c5cbc0",
    layers: () => [
      rect(0, 0, 200, 148, "#ded7bb"),
      vector("M98 148L101 15", "transparent", { stroke: "#544f2e", strokeWidth: 5 }),
      oval(40, 24, 57, 34, "#377657", { rotation: 30 }),
      oval(105, 49, 61, 37, "#92b566", { rotation: -32 }),
      oval(39, 89, 59, 36, "#839f46", { rotation: 25 }),
    ],
  },
  saturation: {
    title: "Saturated four-petal blossom",
    background: "#dfd1bf",
    layers: () => [
      rect(0, 0, 200, 148, paper),
      oval(42, 14, 62, 67, "#bf6659"),
      oval(98, 14, 62, 67, "#5d86b4"),
      oval(42, 72, 62, 63, "#91a66d"),
      oval(98, 72, 62, 63, "#ba8fa1"),
      oval(84, 60, 34, 34, "#dfbc72"),
    ],
    effect: { amount: 0.91 },
  },
  hue: {
    title: "Rotating interlocked color rings",
    background: "#21212f",
    layers: () => [
      ring(22, 29, 90, 90, "#f2b23a", 18),
      ring(87, 29, 90, 90, "#45a1bb", 18),
      ring(55, 8, 90, 90, "#d15a72", 18),
    ],
    effect: { amount: 0.76 },
  },
  exposure: {
    title: "Moonlit mountain exposure",
    background: "#162331",
    layers: () => [
      field(["#132033", "#424c64"]),
      oval(136, 11, 34, 34, "#aaad9c"),
      vector("M-10 148L70 29L112 92L146 57L214 148Z", "#71818d"),
      vector("M29 92L70 29L96 70L71 61L59 80Z", "#afb4b3"),
      vector("M0 148L120 90L205 148Z", "#273646"),
    ],
    effect: { amount: 0.67 },
  },
  vibrance: {
    title: "Pastel butterfly wings",
    background: "#d5d1d6",
    layers: () => [
      rect(0, 0, 200, 148, "#ece2d2"),
      oval(20, 12, 83, 75, "#83b7bd", { rotation: 27 }),
      oval(103, 12, 79, 75, "#c69ea4", { rotation: -27 }),
      oval(49, 72, 50, 65, "#b9ba76", { rotation: -20 }),
      oval(103, 72, 50, 65, "#b29ac6", { rotation: 20 }),
      oval(96, 26, 9, 101, "#5e5a57"),
    ],
    effect: { amount: 0.95 },
  },
  temperature: {
    title: "Warm desert dune layers",
    background: "#c9a381",
    layers: () => [
      field(["#b8b9bb", "#d7c7a2"]),
      oval(124, 12, 48, 48, "#ded1a7"),
      vector("M0 75Q70 27 200 92V148H0Z", "#b5a589"),
      vector("M0 109Q134 47 200 109V148H0Z", "#897c6e"),
      vector("M0 131Q96 97 200 137V148H0Z", "#615f5a"),
    ],
    effect: { amount: 0.88 },
  },
  tint: {
    title: "Tinted chrome torus",
    background: "#302b3a",
    layers: () => [
      sphere(30, 4, 140, ["#ffffff", "#97959c", "#28262e"]),
      oval(71, 45, 58, 58, "#302b3a"),
      ring(37, 12, 124, 122, "#c0bdc6", 3),
    ],
    effect: { amount: 0.82 },
  },
  gamma: {
    title: "Midtone stair sculpture",
    background: "#383a3f",
    layers: () => [
      rect(0, 0, 200, 148, "#23252b"),
      ...[0, 1, 2, 3, 4, 5].map((i) =>
        rect(
          17 + i * 27,
          121 - i * 19,
          27,
          19 + i * 19,
          ["#383838", "#505050", "#6c6c6c", "#898989", "#aaaaaa", "#cecece"][i]!,
        ),
      ),
      oval(19, 14, 41, 41, "#b5b5b5"),
    ],
    effect: { amount: 0.73 },
  },
  invert: {
    title: "Negative sunburst disk",
    background: "#13151c",
    layers: () => [
      rect(0, 0, 200, 148, "#ece3be"),
      ...Array.from({ length: 12 }, (_, i) => rect(97, 4, 7, 140, "#17282a", { rotation: i * 15 })),
      oval(65, 39, 70, 70, "#e6a841"),
      oval(81, 55, 38, 38, "#303c34"),
    ],
  },
  sepia: {
    title: "Vintage camera postcard",
    background: "#b7a693",
    layers: () => [
      rect(0, 0, 200, 148, "#dad4c4"),
      rect(24, 45, 152, 82, "#60696c", { radius: 9 }),
      rect(53, 28, 55, 26, "#3e4547", { radius: 4 }),
      sphere(66, 52, 67, ["#b4c9cd", "#1d2d34"]),
      ring(72, 58, 55, 55, "#d5d8cd", 7),
      rect(141, 58, 20, 13, "#b6b8aa"),
    ],
  },
  threshold: {
    title: "High-contrast fingerprint",
    background: "#dfd6c8",
    layers: () => [
      field(["#eeeeee", "#7b7b7b"]),
      ...Array.from({ length: 10 }, (_, i) =>
        ring(
          20 + i * 8,
          3 + i * 6,
          160 - i * 16,
          145 - i * 12,
          i % 2 ? "#a0a0a0" : "#444444",
          6,
          -18,
        ),
      ),
    ],
    effect: { amount: 0.52 },
  },
  posterize: {
    title: "Pop-art citrus cross-section",
    background: "#e5b5a1",
    layers: () => [
      rect(0, 0, 200, 148, "#dc9b82"),
      sphere(30, 4, 140, ["#fff3ab", "#ec783a", "#b9315c"]),
      ...Array.from({ length: 8 }, (_, i) =>
        rect(98, 18, 3, 111, "#ffe7b1", { rotation: i * 22.5 }),
      ),
      oval(91, 65, 18, 18, "#fff0c4"),
    ],
    effect: { levels: 4 },
  },
  gradient: {
    title: "Flowing aurora color field",
    background: "#171b30",
    layers: () => [rect(0, 0, 200, 148, "#ffffff")],
    effect: { time: 2.2, seed: 17 },
  },
  thermal: {
    title: "Thermal hand silhouette",
    background: "#101022",
    layers: () => [
      rect(0, 0, 200, 148, "#101010"),
      ...[0, 1, 2, 3].map((i) =>
        rect(63 + i * 21, 12 + [25, 4, 0, 15][i]!, 19, 89, "#cecece", {
          radius: 9,
          fillGradient: paint(["#f9f9f9", "#737373"], true),
        }),
      ),
      oval(62, 62, 85, 85, "#aaaaaa", { fillGradient: paint(["#eeeeee", "#666666"], true) }),
      rect(40, 67, 23, 70, "#a0a0a0", { radius: 11, rotation: -35 }),
    ],
    effect: { settings: { palette: "rainbow", gain: 1.1, edges: 0.25 } },
  },
} satisfies Record<string, SourceScene>;
