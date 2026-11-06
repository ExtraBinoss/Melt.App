import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  parseProject,
  serializeProject,
  validateProject,
} from "../../../src/index";
import { GLOW_DEFINITION } from "../../../src/effects/glow/definition";
import {
  NEON_MELT_DEFINITION,
  NEON_MELT_PALETTES,
} from "../../../src/effects/neon-melt/definition";
import { patchEffectParameter } from "../../../src/effects/parameters";

it("declares bounded highlight bloom and a composite with real independent SDK targets", () => {
  for (const definition of [GLOW_DEFINITION, NEON_MELT_DEFINITION]) {
    expect(definition.coverage).toBe("expand");
    expect(definition.identityAtZero).toBe(true);
    expect(Object.isFrozen(definition.defaults.settings)).toBe(true);
    for (const key of definition.sdk!.preferredTargets!)
      expect(definition.parameters.some((parameter) => parameter.key === key)).toBe(true);
    for (const parameter of definition.parameters) {
      if (parameter.kind !== "number" || parameter.scope !== "settings") continue;
      expect(parameter.default).toBeGreaterThanOrEqual(parameter.min);
      expect(parameter.default).toBeLessThanOrEqual(parameter.max);
      expect(parameter.step).toBeGreaterThan(0);
    }
  }
  expect(NEON_MELT_DEFINITION.sdk!.direction).toBe("direction");
  expect(NEON_MELT_PALETTES).toEqual(["acid", "spectral", "ultraviolet"]);
});

it("validates, serializes and undoes glow and composite edits as one ordinary engine command", () => {
  for (const definition of [GLOW_DEFINITION, NEON_MELT_DEFINITION]) {
    const effect = createEffect(definition.type),
      project = createProject({
        pages: [
          createPage({ layers: [createLayer("rectangle", { id: "light", effects: [effect] })] }),
        ],
      }),
      engine = new EditorEngine(project),
      parameter = definition.parameters.find((item) => item.key === "radius")!,
      patch = patchEffectParameter(effect, parameter, 80),
      before = engine.getSnapshot().project;
    engine.execute({
      type: "updateLayers",
      ids: ["light"],
      patch: { effects: [{ ...effect, ...patch }] },
    });
    const after = engine.getSnapshot().project;
    expect(after.pages[0]!.layers[0]!.effects[0]!.settings!.radius).toBe(80);
    expect(parseProject(serializeProject(after))).toEqual(after);
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    engine.redo();
    expect(engine.getSnapshot().project).toEqual(after);
    for (const settings of [
      { radius: -1 },
      { threshold: 2 },
      { knee: NaN },
      { intensity: 7 },
      { glowOnly: "yes" },
      { tint: "bad-color" },
    ]) {
      const invalid = structuredClone(after);
      invalid.pages[0]!.layers[0]!.effects[0]!.settings = settings;
      expect(() => validateProject(invalid)).toThrow();
      expect(() =>
        engine.execute({
          type: "updateLayers",
          ids: ["light"],
          patch: { effects: [{ ...effect, settings }] },
        }),
      ).toThrow();
      expect(engine.getSnapshot().project).toEqual(after);
    }
  }
});

it("rejects unsupported neon palettes, nonfinite flow and unbounded displacement", () => {
  const effect = createEffect("neon-melt"),
    project = createProject({
      pages: [createPage({ layers: [createLayer("rectangle", { effects: [effect] })] })],
    });
  for (const settings of [
    { palette: "fake" },
    { distortion: 97 },
    { liquidScale: 0 },
    { direction: 181 },
    { phase: Infinity },
  ]) {
    const invalid = structuredClone(project);
    invalid.pages[0]!.layers[0]!.effects[0]!.settings = settings;
    expect(() => validateProject(invalid)).toThrow();
  }
});
