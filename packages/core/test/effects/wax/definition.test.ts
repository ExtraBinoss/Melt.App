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
  validateProject,
} from "../../../src/index";

describe("Wax authoring", () => {
  it("resolves bounded defaults and rejects malformed coating settings", () => {
    const effect = createEffect("wax"),
      definition = getEffectDefinition("wax");
    expect(effect.settings).toBeUndefined();
    expect(definition.coverage).toBe("preserve");
    expect(definition.identityAtZero).toBe(true);
    expect(definition.sdk?.direction).toBe("lightAngle");
    for (const parameter of definition.parameters) {
      const value = getEffectParameter(effect, parameter);
      expect(() => patchEffectParameter(effect, parameter, value)).not.toThrow();
      if (parameter.kind === "number")
        for (const invalid of [NaN, Infinity, parameter.min - 1, parameter.max + 1])
          expect(() => patchEffectParameter(effect, parameter, invalid)).toThrow();
      else if (parameter.kind === "color")
        expect(() => patchEffectParameter(effect, parameter, "warm wax")).toThrow();
    }
    for (const target of definition.sdk?.preferredTargets ?? [])
      expect(definition.parameters.some((parameter) => parameter.key === target)).toBe(true);
  });

  it("keeps edits sparse, atomic and portable through undo/redo and Motion", () => {
    const effect = createEffect("wax", { id: "coating" }),
      layer = createLayer("rectangle", { id: "surface", effects: [effect] }),
      engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
      before = engine.getSnapshot().project,
      parameter = getEffectDefinition("wax").parameters.find((p) => p.key === "blur")!,
      edited = { ...effect, ...patchEffectParameter(effect, parameter, 12) };
    expect(edited.settings).toEqual({ blur: 12 });
    engine.execute({ type: "updateLayers", ids: [layer.id], patch: { effects: [edited] } });
    const after = engine.getSnapshot().project;
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: [layer.id],
        patch: { effects: [{ ...edited, settings: { blur: 21 } }] },
      }),
    ).toThrow();
    expect(engine.getSnapshot().project).toBe(after);
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    engine.redo();
    expect(engine.getSnapshot().project).toEqual(after);
    expect(() => validateProject(JSON.parse(JSON.stringify(after)))).not.toThrow();
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    for (const value of [0.5, 12])
      engine.execute({
        type: "upsertMotionKeyframe",
        target: {
          kind: "effectSetting",
          layerId: layer.id,
          effectId: effect.id,
          property: "blur",
        },
        time: { value: value === 0.5 ? 0 : 1, rate: 1 },
        value,
      });
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings).toEqual({
      blur: 12,
    });
    expect(() => validateProject(engine.getSnapshot().project)).not.toThrow();
  });
});
