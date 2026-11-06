import { AMOUNT, SCALE, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

export const BLUR_TECHNIQUES = Object.freeze([
  "gaussian",
  "box",
  "directional",
  "spin",
  "zoom",
  "lens",
  "bilateral",
  "progressive",
] as const);
export const BLUR_DEFAULT_SETTINGS = Object.freeze({
  technique: "gaussian",
  angle: 0,
  centerX: 0.5,
  centerY: 0.5,
  spinAngle: 30,
  zoomStrength: 0.5,
  apertureBlades: 6,
  apertureRotation: 0,
  rangeSigma: 0.1,
  gradientShape: "linear",
  gradientStart: 0,
  gradientEnd: 1,
  gradientPower: 1,
  gradientInvert: false,
  protect: false,
  protectedRadius: 96,
  feather: 48,
});
const field = effectFields("blurFx");
const technique = (...values: string[]) => ({ key: "technique", values });
const protectedRegion = { key: "protect", values: ["true"] };

/** The original Gaussian amount × scale and expanding RGBA contract remain the default. */
export const BLUR_DEFINITION = Object.freeze({
  ...defineEffect(
    "blur",
    { settings: BLUR_DEFAULT_SETTINGS },
    [
      AMOUNT,
      SCALE,
      field.choice("technique", "gaussian", BLUR_TECHNIQUES),
      {
        ...field.number("angle", 0, -180, 180, 1, "°"),
        visibleWhen: technique("directional", "progressive"),
      },
      { ...field.number("centerX", 0.5, 0, 1, 0.001, "%"), displayScale: 100 },
      { ...field.number("centerY", 0.5, 0, 1, 0.001, "%"), displayScale: 100 },
      { ...field.number("spinAngle", 30, 0, 180, 1, "°"), visibleWhen: technique("spin") },
      { ...field.number("zoomStrength", 0.5, 0, 2), visibleWhen: technique("zoom") },
      {
        ...field.number("apertureBlades", 6, 3, 12, 1),
        integer: true,
        visibleWhen: technique("lens"),
      },
      {
        ...field.number("apertureRotation", 0, -180, 180, 1, "°"),
        visibleWhen: technique("lens"),
      },
      { ...field.number("rangeSigma", 0.1, 0.01, 1), visibleWhen: technique("bilateral") },
      {
        ...field.choice("gradientShape", "linear", ["linear", "radial", "band"]),
        visibleWhen: technique("progressive"),
      },
      {
        ...field.number("gradientStart", 0, 0, 1, 0.001, "%"),
        displayScale: 100,
        visibleWhen: technique("progressive"),
      },
      {
        ...field.number("gradientEnd", 1, 0, 1, 0.001, "%"),
        displayScale: 100,
        visibleWhen: technique("progressive"),
      },
      { ...field.number("gradientPower", 1, 0.1, 8), visibleWhen: technique("progressive") },
      { ...field.boolean("gradientInvert", false), visibleWhen: technique("progressive") },
      field.boolean("protect", false),
      { ...field.number("protectedRadius", 96, 0, 8192, 1, "px"), visibleWhen: protectedRegion },
      { ...field.number("feather", 48, 0, 2048, 1, "px"), visibleWhen: protectedRegion },
    ],
    "effect",
    "expand",
  ),
  gizmo: Object.freeze({
    kind: "radial" as const,
    enabled: "protect",
    centerX: "centerX",
    centerY: "centerY",
    radius: "protectedRadius",
    feather: "feather",
    radiusUnits: "document" as const,
  }),
});
