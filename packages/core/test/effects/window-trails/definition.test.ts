import { expect, test } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectDefinition,
  patchEffectParameter,
  validateProject,
} from "../../../src/index";
import { validateEffectInputs } from "../../../src/effects/inputs";

test("bounds trail work, validates choices and keeps time changes undoable", () => {
  const effect = createEffect("window-trails", { id: "windows" });
  const definition = getEffectDefinition("window-trails");
  const parameter = (key: string) => definition.parameters.find((item) => item.key === key)!;
  for (const [key, invalid] of [
    ["count", 33],
    ["count", 1.5],
    ["ribbons", 4],
    ["frameRows", 0],
    ["time", NaN],
    ["path", "random"],
    ["paper", "red"],
  ] as const)
    expect(() => patchEffectParameter(effect, parameter(key), invalid)).toThrow();
  expect(patchEffectParameter(effect, parameter("count"), 32).settings?.count).toBe(32);
  expect(patchEffectParameter(effect, parameter("ribbons"), 3).settings?.ribbons).toBe(3);
  const layer = createLayer("rectangle", { id: "source", effects: [effect] });
  const project = createProject({ pages: [createPage({ layers: [layer] })] });
  validateProject(project);
  const engine = new EditorEngine(project);
  engine.execute({
    type: "updateLayers",
    ids: [layer.id],
    patch: { effects: [{ ...effect, time: 4 }] },
  });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.time).toBe(4);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(project);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.time).toBe(4);
});

test("accepts optional image chrome and rejects missing or wrong-kind input assets", () => {
  const effect = createEffect("window-trails", { inputs: { frame: "chrome" } });
  expect(() => validateEffectInputs(effect, {})).toThrow();
  expect(() => validateEffectInputs({ ...effect, inputs: { unknown: "chrome" } })).toThrow();
  expect(() =>
    validateEffectInputs(effect, {
      chrome: {
        id: "chrome",
        kind: "model3d",
        name: "Model",
        mime: "model/gltf-binary",
        width: 1,
        height: 1,
        dataUrl: "data:model/gltf-binary;base64,AA==",
      },
    }),
  ).toThrow();
  expect(() =>
    validateEffectInputs(effect, {
      chrome: {
        id: "chrome",
        kind: "image",
        name: "Chrome",
        mime: "image/svg+xml",
        width: 32,
        height: 32,
        dataUrl: "data:image/svg+xml,%3Csvg%2F%3E",
      },
    }),
  ).not.toThrow();
});
