import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectParameter,
  isEffectParameterVisible,
  patchEffectParameter,
} from "../../../src/index";
import { RISOGRAPH_DEFINITION } from "../../../src/effects/risograph/definition";

it("validates print settings, exposes the third ink conditionally and preserves undo transactions", () => {
  const effect = createEffect("risograph");
  for (const parameter of RISOGRAPH_DEFINITION.parameters) {
    expect(() =>
      patchEffectParameter(effect, parameter, getEffectParameter(effect, parameter)),
    ).not.toThrow();
    if (parameter.kind === "number") {
      expect(() => patchEffectParameter(effect, parameter, parameter.max + 1)).toThrow();
      expect(() => patchEffectParameter(effect, parameter, NaN)).toThrow();
    }
  }
  const palette = RISOGRAPH_DEFINITION.parameters.find((p) => p.key === "palette")!,
    thirdInk = RISOGRAPH_DEFINITION.parameters.find((p) => p.key === "inkC")!;
  expect(isEffectParameterVisible(effect, thirdInk)).toBe(false);
  expect(() => patchEffectParameter(effect, palette, "four-inks")).toThrow();
  const tritone = { ...effect, ...patchEffectParameter(effect, palette, "tritone") };
  expect(isEffectParameterVisible(tritone, thirdInk)).toBe(true);
  const layer = createLayer("rectangle", { effects: [effect] }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    before = engine.getSnapshot().project;
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { effects: [tritone] } });
  const after = engine.getSnapshot().project;
  expect(after.pages[0]!.layers[0]!.effects[0]!.settings!.palette).toBe("tritone");
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: [layer.id],
      patch: { effects: [{ ...tritone, settings: { unexpected: 1 } }] },
    }),
  ).toThrow();
  expect(engine.getSnapshot().project).toBe(after);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(after);
});
