import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectParameter,
  patchEffectParameter,
} from "../../../src/index";
import { OIL_PAINT_DEFINITION } from "../../../src/effects/oil-paint/definition";

it("bounds painterly controls and commits brush changes as a reversible validated edit", () => {
  const effect = createEffect("oil-paint");
  for (const parameter of OIL_PAINT_DEFINITION.parameters) {
    expect(() =>
      patchEffectParameter(effect, parameter, getEffectParameter(effect, parameter)),
    ).not.toThrow();
    if (parameter.kind === "number") {
      expect(() => patchEffectParameter(effect, parameter, parameter.max + 1)).toThrow();
      expect(() => patchEffectParameter(effect, parameter, "6")).toThrow();
    }
  }
  const brushScale = OIL_PAINT_DEFINITION.parameters.find((p) => p.key === "brushScale")!,
    edited = { ...effect, ...patchEffectParameter(effect, brushScale, 20) },
    layer = createLayer("rectangle", { effects: [effect] }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    before = engine.getSnapshot().project;
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { effects: [edited] } });
  const after = engine.getSnapshot().project;
  expect(after.pages[0]!.layers[0]!.effects[0]!.settings!.brushScale).toBe(20);
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: [layer.id],
      patch: { effects: [{ ...edited, settings: { brushScale: Infinity } }] },
    }),
  ).toThrow();
  expect(engine.getSnapshot().project).toBe(after);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(after);
});
