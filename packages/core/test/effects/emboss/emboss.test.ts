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
import { isEffectParameterVisible } from "../../../src/effects/parameters";

describe("emboss authoring", () => {
  it("provides four relief profiles, sparse defaults and validated native controls", () => {
    const effect = createEffect("emboss"),
      definition = getEffectDefinition("emboss"),
      mode = definition.parameters.find((p) => p.key === "mode")!;
    expect(effect.settings).toBeUndefined();
    expect(definition.identityAtZero).toBe(true);
    expect(definition.coverage).toBe("preserve");
    expect(definition.sdk?.direction).toBe("azimuth");
    expect(mode.kind === "select" && mode.options.map((p) => p.value)).toEqual([
      "raised",
      "recessed",
      "pillow",
      "outline",
    ]);
    for (const parameter of definition.parameters) {
      const value = getEffectParameter(effect, parameter);
      expect(() => patchEffectParameter(effect, parameter, value)).not.toThrow();
      if (parameter.kind === "number") {
        for (const invalid of [NaN, Infinity, parameter.min - 1, parameter.max + 1])
          expect(() => patchEffectParameter(effect, parameter, invalid)).toThrow();
      } else if (parameter.kind === "select") {
        expect(() => patchEffectParameter(effect, parameter, "unknown-profile")).toThrow();
      } else if (parameter.kind === "color") {
        expect(() => patchEffectParameter(effect, parameter, "#fff")).toThrow();
      }
    }
    const materialColor = definition.parameters.find((p) => p.key === "materialColor")!;
    expect(isEffectParameterVisible(effect, materialColor)).toBe(true);
    expect(
      isEffectParameterVisible({ ...effect, settings: { material: "source" } }, materialColor),
    ).toBe(false);
    for (const target of definition.sdk?.preferredTargets ?? [])
      expect(definition.parameters.some((parameter) => parameter.key === target)).toBe(true);
  });

  it("persists combined material/profile edits atomically with undo and rejects malformed modes", () => {
    const effect = createEffect("emboss"),
      layer = createLayer("rectangle", { effects: [effect] }),
      engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
      before = engine.getSnapshot().project,
      edited = {
        ...effect,
        settings: { mode: "recessed", height: "alpha", materialColor: "#8899aa" },
      };
    engine.execute({ type: "updateLayers", ids: [layer.id], patch: { effects: [edited] } });
    const after = engine.getSnapshot().project;
    expect(after.pages[0]!.layers[0]!.effects[0]!.settings).toEqual(edited.settings);
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: [layer.id],
        patch: { effects: [{ ...edited, settings: { mode: "fake" } }] },
      }),
    ).toThrow();
    expect(engine.getSnapshot().project).toBe(after);
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    engine.redo();
    expect(engine.getSnapshot().project).toEqual(after);
  });
});
