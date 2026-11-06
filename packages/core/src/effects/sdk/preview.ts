import type { Effect, EffectType } from "../../document/model";

/** Stable source IDs; the catalog baker owns the corresponding photographic assets. */
export const EFFECT_PREVIEW_SOURCES = Object.freeze([
  "editorial-portrait",
  "alpine-lake",
  "studio-still-life",
  "neon-city",
] as const);

export type EffectPreviewSource = (typeof EFFECT_PREVIEW_SOURCES)[number];
export type EffectPreviewScene = "photo" | "depth" | "temporal" | "typography";

/** Build-time presentation metadata, never serialized into a user's document. */
export interface EffectPreviewDefinition {
  readonly source: EffectPreviewSource;
  /** Capability-aware staging; omitted scenes use the source photograph directly. */
  readonly scene?: EffectPreviewScene;
  /** Ordinary validated effect values used only when baking the catalog thumbnail. */
  readonly effect?: Readonly<Partial<Omit<Effect, "id" | "type">>>;
}

const preview = (
  source: EffectPreviewSource,
  effect: NonNullable<EffectPreviewDefinition["effect"]> = {},
  scene: EffectPreviewScene = "photo",
): EffectPreviewDefinition =>
  Object.freeze({
    source,
    scene,
    effect: Object.freeze({
      ...effect,
      ...(effect.settings ? { settings: Object.freeze({ ...effect.settings }) } : {}),
    }),
  });

/** Deliberate art direction for built-ins; an effect author's own declaration takes priority. */
export const BUILTIN_EFFECT_PREVIEWS: Readonly<Record<EffectType, EffectPreviewDefinition>> =
  Object.freeze({
    glow: preview("neon-city"),
    "neon-melt": preview("neon-city"),
    repeater: preview("studio-still-life"),
    "wave-distortion": preview("alpine-lake"),
    "shape-grid": preview("editorial-portrait"),
    watercolor: preview("alpine-lake"),
    "depth-anything": preview("editorial-portrait"),
    "depth-of-field": preview(
      "studio-still-life",
      {
        settings: {
          focusDistance: 4.5,
          focusRange: 0.06,
          aperture: 0.8,
          maxBlur: 12,
          edgeProtection: 0.75,
        },
      },
      "depth",
    ),
    trail: preview(
      "editorial-portrait",
      { settings: { mode: "temporal", echoCount: 4, delay: 0.13, fade: 0.75 } },
      "temporal",
    ),
    risograph: preview("editorial-portrait"),
    "oil-paint": preview("alpine-lake"),
    blocks: preview("editorial-portrait"),
    "chromatic-aberration": preview("neon-city"),
    wind: preview("editorial-portrait"),
    liquify: preview("editorial-portrait", {
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
    }),
    "torn-edges": preview("editorial-portrait", {
      settings: { technique: "paper", tearWidth: 12, roughness: 0.65, sourceColor: 1 },
    }),
    terminal: preview(
      "neon-city",
      { time: 1.2, settings: { progress: 0.82, columns: 20, rows: 6, cursor: "block" } },
      "typography",
    ),
    "ink-bleed": preview("editorial-portrait", {
      settings: { radius: 3, density: 1.5, roughness: 0.85 },
    }),
    "pixel-sort": preview("neon-city", {
      settings: { axis: "vertical", window: "64", cellSize: 2 },
    }),
    "edge-detect": preview("studio-still-life"),
    "window-trails": preview("editorial-portrait", {
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
    }),
    "time-warp-scan": preview("neon-city"),
    bevel: preview("studio-still-life", {
      settings: { size: 7, depth: 7, gloss: 18, ambient: 0.62 },
    }),
    displace: preview("alpine-lake", {
      inputs: { map: "catalog-displacement" },
      settings: { strengthX: 28, strengthY: 17, dispersion: 0.18 },
    }),
    thermal: preview("editorial-portrait", {
      settings: { palette: "rainbow", gain: 1.1, edges: 0.25 },
    }),
    morph: preview(
      "studio-still-life",
      { settings: { progress: 0.56, stagger: 0.3, inflate: 0.9, stretch: 1.5 } },
      "typography",
    ),
    dither: preview("editorial-portrait", { scale: 3, levels: 4, color: true }),
    ascii: preview("editorial-portrait", {
      scale: 5,
      settings: { palette: "solid", foreground: "#a8e3c2", background: "#091611", contrast: 1.15 },
    }),
    brightness: preview("editorial-portrait", { amount: 0.63 }),
    contrast: preview("editorial-portrait", { amount: 0.78 }),
    grayscale: preview("editorial-portrait"),
    blur: preview("neon-city", { scale: 3 }),
    shadow: preview("studio-still-life", {
      settings: { offsetX: 10, offsetY: 10, radius: 8, shadowColor: "#302c29" },
    }),
    saturation: preview("alpine-lake", { amount: 0.91 }),
    hue: preview("studio-still-life", { amount: 0.76 }),
    exposure: preview("alpine-lake", { amount: 0.67 }),
    vibrance: preview("alpine-lake", { amount: 0.95 }),
    temperature: preview("editorial-portrait", { amount: 0.88 }),
    tint: preview("editorial-portrait", { amount: 0.82 }),
    gamma: preview("studio-still-life", { amount: 0.73 }),
    invert: preview("neon-city"),
    sepia: preview("editorial-portrait"),
    threshold: preview("editorial-portrait", { amount: 0.52 }),
    posterize: preview("alpine-lake", { levels: 4 }),
    feather: preview("editorial-portrait", { settings: { radius: 0.46, softness: 0.4 } }),
    grain: preview("editorial-portrait", { amount: 0.38, scale: 2, color: false }),
    halftone: preview("editorial-portrait", {
      scale: 5,
      color: true,
      settings: { pattern: "color-screen", dotSize: 0.92, softness: 0.2 },
    }),
    vignette: preview("editorial-portrait", { amount: 0.83, scale: 2 }),
    gradient: preview("alpine-lake", { amount: 0.6, time: 2.2, seed: 17 }),
    ripple: preview("alpine-lake", {
      time: 0.9,
      settings: {
        innerRadius: 0,
        radius: 150,
        feather: 20,
        amplitude: 10,
        wavelength: 29,
        dispersion: 0.2,
      },
    }),
    shatter: preview("studio-still-life", {
      scale: 45,
      settings: { spokes: 12, displacement: 10, crackWidth: 1.5, dispersion: 0.35 },
    }),
    noise: preview("neon-city", {
      amount: 0.45,
      scale: 36,
      color: true,
      settings: { algorithm: "ridged", contrast: 1.65, octaves: 4 },
    }),
    flashlight: preview("studio-still-life", {
      settings: { radius: 0.49, softness: 0.45, ambient: 0.04, intensity: 1.7 },
    }),
    circle: preview("editorial-portrait", {
      settings: { spacing: 7, foreground: "#7d354a", background: "#f5dfc9", gamma: 0.9 },
    }),
    cyanotype: preview("alpine-lake", {
      settings: { edgeWidth: 10, edgeFade: 0.1, paperGrain: 0.06 },
    }),
    crt: preview("neon-city", {
      settings: { scanlinePitch: 4, scanlineStrength: 0.45, curvatureX: 0.16, curvatureY: 0.12 },
    }),
    datamosh: preview("neon-city", {
      time: 1.2,
      settings: { blockSize: 14, density: 0.55, displacement: 25, chromaShift: 4 },
    }),
    "bit-dither": preview("editorial-portrait", {
      scale: 3,
      settings: { method: "bayer4", foreground: "#23322a", background: "#e6e8c2" },
    }),
    receipt: preview("editorial-portrait", {
      scale: 1.5,
      settings: { contrast: 1.4, paperTexture: 0.08 },
    }),
    "pink-phosphor": preview("editorial-portrait", {
      scale: 2,
      settings: { glow: 0.48, scanlines: 0.3, glowRadius: 2 },
    }),
    transition: preview("alpine-lake", {
      settings: { style: "diagonal-wipe", progress: 0.64 },
    }),
  });
