import { CATALOG_PARAMETERS } from "./catalog-parameters";
import { describe, expect, it } from "vitest";
import { EFFECT_CATALOG, getEffectDefinition } from "../../src/effects/catalog";
import { getEffectParameter, patchEffectParameter } from "../../src/effects/parameters";
import { createEffect, createLayer } from "../../src/document/factories";
describe("portable effect definitions", () => {
  it("describes every supported effect once, with the existing deterministic defaults", () => {
    expect(Object.keys(EFFECT_CATALOG)).toEqual([
      "terminal",
      "torn-edges",
      "liquify",
      "ink-bleed",
      "pixel-sort",
      "edge-detect",
      "window-trails",
      "bevel",
      "displace",
      "thermal",
      "time-warp-scan",
      "morph",
      "dither",
      "ascii",
      "brightness",
      "contrast",
      "grayscale",
      "blur",
      "shadow",
      "saturation",
      "hue",
      "exposure",
      "vibrance",
      "temperature",
      "tint",
      "gamma",
      "invert",
      "sepia",
      "threshold",
      "posterize",
      "grain",
      "halftone",
      "vignette",
      "gradient",
      "ripple",
      "shatter",
      "noise",
      "flashlight",
      "circle",
      "cyanotype",
      "datamosh",
      "crt",
      "bit-dither",
      "receipt",
      "pink-phosphor",
      "transition",
    ]);
    expect(getEffectDefinition("dither")).toMatchObject({
      type: "dither",
      nameKey: "dither",
      defaults: { enabled: true, amount: 1, scale: 2, levels: 2, color: false, seed: 42 },
    });
    expect(getEffectDefinition("ascii").defaults).toMatchObject({
      amount: 1,
      scale: 10,
      levels: 10,
      color: true,
    });
    expect(getEffectDefinition("brightness").defaults.amount).toBe(0.5);
    expect(getEffectDefinition("contrast").defaults.amount).toBe(0.5);
    expect(getEffectDefinition("grayscale").defaults.amount).toBe(1);
    expect(getEffectDefinition("blur").defaults.scale).toBe(2);
  });
  it("provides typed controls in document units and meaningful display metadata", () => {
    for (const definition of Object.values(EFFECT_CATALOG)) {
      expect(definition.parameters.map((parameter) => parameter.key)).toEqual(
        CATALOG_PARAMETERS[definition.type],
      );
      expect(getEffectDefinition(definition.type)).toBe(definition);
      expect(definition.coverage).toBe(
        [
          "terminal",
          "liquify",
          "ink-bleed",
          "pixel-sort",
          "blur",
          "shadow",
          "displace",
          "window-trails",
          "time-warp-scan",
        ].includes(definition.type)
          ? "expand"
          : [
                "torn-edges",
                "halftone",
                "edge-detect",
                "gradient",
                "circle",
                "shatter",
                "crt",
                "receipt",
                "transition",
              ].includes(definition.type)
            ? "reduce"
            : "preserve",
      );
      expect(definition.category).toBe(
        [
          "liquify",
          "torn-edges",
          "terminal",
          "ink-bleed",
          "pixel-sort",
          "edge-detect",
          "window-trails",
          "bevel",
          "displace",
          "thermal",
          "time-warp-scan",
          "dither",
          "ascii",
          "blur",
          "shadow",
          "grain",
          "halftone",
          "vignette",
          "gradient",
          "ripple",
          "shatter",
          "noise",
          "flashlight",
          "circle",
          "cyanotype",
          "datamosh",
          "crt",
          "bit-dither",
          "receipt",
          "pink-phosphor",
          "transition",
          "morph",
        ].includes(definition.type)
          ? "effect"
          : "adjustment",
      );
      for (const parameter of definition.parameters) {
        expect(parameter.labelKey.length).toBeGreaterThan(0);
        if (parameter.kind === "boolean")
          expect(typeof getEffectParameter(createEffect(definition.type), parameter)).toBe(
            "boolean",
          );
        else if (parameter.kind === "number") {
          const value = getEffectParameter(createEffect(definition.type), parameter);
          expect(value).toBeGreaterThanOrEqual(parameter.min);
          expect(value).toBeLessThanOrEqual(parameter.max);
          expect(parameter.step).toBeGreaterThan(0);
          expect(parameter.displayScale).toBeGreaterThan(0);
          if (parameter.key === "amount")
            expect(parameter).toMatchObject({
              min: 0,
              max: 1,
              step: 0.01,
              displayScale: 100,
              unit: "%",
            });
          if (parameter.key === "scale" && !["gradient", "vignette"].includes(definition.type))
            expect(parameter.unit).toBe("px");
        }
      }
    }
    expect(
      getEffectDefinition("ascii").parameters.find((parameter) => parameter.key === "scale"),
    ).toMatchObject({ max: 128 });
    expect(
      getEffectDefinition("dither").parameters.find((parameter) => parameter.key === "scale"),
    ).toMatchObject({ max: 128 });
  });
  it("keeps shared definitions deeply immutable while factories produce independent effect instances", () => {
    const definition = getEffectDefinition("dither");
    expect(Object.isFrozen(EFFECT_CATALOG)).toBe(true);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.defaults)).toBe(true);
    expect(Object.isFrozen(definition.parameters)).toBe(true);
    expect(Object.isFrozen(definition.parameters[0])).toBe(true);
    const first = createEffect("dither", { amount: 0.2 });
    const second = createEffect("dither");
    expect(first.id).not.toBe(second.id);
    first.scale = 10;
    expect(second.scale).toBe(2);
    expect(definition.defaults.amount).toBe(1);
    expect(definition.defaults.scale).toBe(2);
    expect(createLayer("text").fontFamily).toBe("Inter");
  });
  it("rejects unknown names and prototype keys at the public catalogue boundary", () => {
    expect(() => getEffectDefinition("unknown" as never)).toThrow("Effet inconnu");
    expect(() => getEffectDefinition("toString" as never)).toThrow("Effet inconnu");
    expect(() => createEffect("unknown" as never)).toThrow("Effet inconnu");
  });
  it("accepts the complete supported pixel and quantization ranges and real deterministic seeds", () => {
    const ascii = createEffect("ascii"),
      dither = createEffect("dither"),
      grain = createEffect("grain");
    const scale = getEffectDefinition("ascii").parameters.find(
      (parameter) => parameter.key === "scale",
    )!;
    const levels = getEffectDefinition("dither").parameters.find(
      (parameter) => parameter.key === "levels",
    )!;
    expect(patchEffectParameter(ascii, scale, 128)).toEqual({ scale: 128 });
    expect(patchEffectParameter(dither, levels, 256)).toEqual({ levels: 256 });
    for (const effect of [dither, grain]) {
      const seed = getEffectDefinition(effect.type).parameters.find(
        (parameter) => parameter.key === "seed",
      )!;
      expect(patchEffectParameter(effect, seed, 145)).toEqual({ seed: 145 });
      expect(() => patchEffectParameter(effect, seed, 145.5)).toThrow();
    }
  });
});
