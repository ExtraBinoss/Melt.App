import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectParameter,
  parseProject,
  patchEffectParameter,
  serializeProject,
  validateEffectParameter,
} from "@musart/core";
import { BLOCKS_DEFINITION } from "../../src/effects/blocks/definition";
import { CHROMATIC_ABERRATION_DEFINITION } from "../../src/effects/chromatic-aberration/definition";
import { WIND_DEFINITION } from "../../src/effects/wind/definition";

const definitions = [BLOCKS_DEFINITION, CHROMATIC_ABERRATION_DEFINITION, WIND_DEFINITION];

it.each(definitions)("$type declares bounded generic position/direction controls", (definition) => {
  const effect = createEffect(definition.type);
  expect(Object.isFrozen(definition)).toBe(true);
  expect(Object.isFrozen(definition.parameters)).toBe(true);
  expect(new Set(definition.parameters.map((parameter) => parameter.key)).size).toBe(
    definition.parameters.length,
  );
  for (const key of ["centerX", "centerY", "angle"])
    expect(definition.parameters.some((parameter) => parameter.key === key)).toBe(true);
  for (const parameter of definition.parameters) {
    expect(() =>
      validateEffectParameter(parameter, getEffectParameter(effect, parameter)),
    ).not.toThrow();
    if (parameter.kind === "number") {
      expect(() => validateEffectParameter(parameter, parameter.min)).not.toThrow();
      expect(() => validateEffectParameter(parameter, parameter.max)).not.toThrow();
      expect(() => validateEffectParameter(parameter, parameter.min - parameter.step)).toThrow();
      expect(() => validateEffectParameter(parameter, parameter.max + parameter.step)).toThrow();
      expect(() => validateEffectParameter(parameter, NaN)).toThrow();
    } else if (parameter.kind === "select") {
      expect(() => validateEffectParameter(parameter, "unknown-mode")).toThrow();
    } else if (parameter.kind === "boolean") {
      expect(() => validateEffectParameter(parameter, 1)).toThrow();
    }
  }
  expect(definition.coverage).toBe(definition.type === "blocks" ? "reduce" : "preserve");
  expect(definition.parameters.some((parameter) => parameter.key === "time")).toBe(
    definition.type === "wind",
  );
});

it.each(definitions)(
  "$type validates edits atomically and preserves portable undo/redo",
  (definition) => {
    const effect = createEffect(definition.type),
      layer = createLayer("rectangle", { effects: [effect] }),
      engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
      center = definition.parameters.find((parameter) => parameter.key === "centerX")!,
      before = engine.getSnapshot().project;
    engine.execute({
      type: "updateLayers",
      ids: [layer.id],
      patch: { effects: [{ ...effect, ...patchEffectParameter(effect, center, 0.25) }] },
    });
    const after = engine.getSnapshot().project;
    expect(after.pages[0]!.layers[0]!.effects[0]!.settings?.centerX).toBe(0.25);
    expect(parseProject(serializeProject(after))).toEqual(after);
    for (const settings of [{ centerX: -0.1 }, { angle: Infinity }, { invented: true }]) {
      expect(() =>
        engine.execute({
          type: "updateLayers",
          ids: [layer.id],
          patch: { effects: [{ ...effect, settings }] },
        }),
      ).toThrow();
      expect(engine.getSnapshot().project).toEqual(after);
    }
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    expect(engine.getSnapshot().canUndo).toBe(false);
    engine.redo();
    expect(engine.getSnapshot().project).toEqual(after);
  },
);
