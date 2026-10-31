import { expect, test } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectDefinition,
  getEffectParameter,
  patchEffectParameter,
  validateEffectParameter,
  parseProject,
  serializeProject,
  resolveEffectSettings,
} from "../../../src/index";
const parameter = (key: string) =>
  getEffectDefinition("ascii").parameters.find((p) => p.key === key)!;
test("legacy ASCII fields resolve neutral new settings without changing source-color intent", () => {
  const legacy = {
    id: "old",
    type: "ascii" as const,
    enabled: true,
    amount: 1,
    scale: 10,
    levels: 10,
    color: false,
    seed: 42,
  };
  const settings = resolveEffectSettings(legacy);
  expect(settings).toMatchObject({
    characters: " .,:;+tfLCG08M@#",
    brightness: 0,
    contrast: 1,
    gamma: 1,
    weight: 0.5,
    palette: "image",
    foreground: "#ffffff",
    background: "#000000",
    shades: 16,
  });
  expect(legacy.color).toBe(false);
  expect(getEffectParameter(legacy, parameter("characters"))).toBe(settings.characters);
});
test("character text remains bounded, preserves spaces/order and round-trips with colors and one undo entry", () => {
  const effect = createEffect("ascii"),
    layer = createLayer("rectangle", { id: "art", effects: [effect] });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  const patch = patchEffectParameter(effect, parameter("characters"), " 01█");
  engine.execute({
    type: "updateLayers",
    ids: ["art"],
    patch: { effects: [{ ...effect, ...patch }] },
  });
  const project = engine.getSnapshot().project;
  expect(
    parseProject(serializeProject(project)).pages[0]!.layers[0]!.effects[0]!.settings!.characters,
  ).toBe(" 01█");
  engine.undo();
  expect(
    getEffectParameter(
      engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!,
      parameter("characters"),
    ),
  ).toBe(" .,:;+tfLCG08M@#");
  expect(engine.getSnapshot().canUndo).toBe(false);
  for (const bad of ["", "x".repeat(65), 3, null])
    expect(() => validateEffectParameter(parameter("characters"), bad)).toThrow();
  expect(() => validateEffectParameter(parameter("characters"), "@")).not.toThrow();
  expect(() => patchEffectParameter(effect, parameter("shades"), 2.5)).toThrow();
  expect(() => patchEffectParameter(effect, parameter("gamma"), 0)).toThrow();
  expect(() => patchEffectParameter(effect, parameter("foreground"), "red")).toThrow();
});
