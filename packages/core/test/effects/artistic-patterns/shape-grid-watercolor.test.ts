import { describe, expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectDefinition,
  getEffectParameter,
  patchEffectParameter,
} from "../../../src/index";

describe.each(["shape-grid", "watercolor"] as const)("%s artistic authoring", (type) => {
  it("resolves every default and rejects malformed numeric, color and choice edits", () => {
    const effect = createEffect(type),
      definition = getEffectDefinition(type);
    expect(effect.settings).toBeUndefined();
    expect(definition.identityAtZero).toBe(true);
    for (const parameter of definition.parameters) {
      const value = getEffectParameter(effect, parameter);
      expect(() => patchEffectParameter(effect, parameter, value)).not.toThrow();
      if (parameter.kind === "number") {
        for (const invalid of [NaN, Infinity, parameter.min - 1, parameter.max + 1])
          expect(() => patchEffectParameter(effect, parameter, invalid)).toThrow();
      } else if (parameter.kind === "select") {
        expect(() => patchEffectParameter(effect, parameter, "unknown-shape")).toThrow();
      } else if (parameter.kind === "color") {
        expect(() => patchEffectParameter(effect, parameter, "red")).toThrow();
      }
    }
    for (const target of definition.sdk?.preferredTargets ?? [])
      expect(definition.parameters.some((parameter) => parameter.key === target)).toBe(true);
  });

  it("commits a sparse treatment edit atomically and restores it through undo/redo", () => {
    const effect = createEffect(type),
      key = type === "shape-grid" ? "cellSize" : "washScale",
      parameter = getEffectDefinition(type).parameters.find((p) => p.key === key)!,
      edited = { ...effect, ...patchEffectParameter(effect, parameter, 12) },
      layer = createLayer("rectangle", { effects: [effect] }),
      engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
      before = engine.getSnapshot().project;
    expect(edited.settings).toEqual({ [key]: 12 });
    engine.execute({ type: "updateLayers", ids: [layer.id], patch: { effects: [edited] } });
    const after = engine.getSnapshot().project;
    expect(after.pages[0]!.layers[0]!.effects[0]!.settings).toEqual({ [key]: 12 });
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: [layer.id],
        patch: { effects: [{ ...edited, settings: { [key]: -5 } }] },
      }),
    ).toThrow();
    expect(engine.getSnapshot().project).toBe(after);
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    engine.redo();
    expect(engine.getSnapshot().project).toEqual(after);
  });
});
