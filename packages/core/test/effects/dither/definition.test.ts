import { expect, test } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectDefinition,
  getEffectParameter,
  isEffectParameterVisible,
  parseProject,
  serializeProject,
  patchEffectParameter,
} from "../../../src/index";

const field = (key: string) => getEffectDefinition("dither").parameters.find((p) => p.key === key)!;
test("legacy Dither resolves multilevel defaults; binary methods use the same source-color and palette controls", () => {
  const effect = createEffect("dither");
  expect(effect.settings).toBeUndefined();
  expect(getEffectParameter(effect, field("method"))).toBe("multilevel");
  expect(isEffectParameterVisible(effect, field("levels"))).toBe(true);
  expect(isEffectParameterVisible(effect, field("foreground"))).toBe(true);
  expect(isEffectParameterVisible({ ...effect, color: true }, field("foreground"))).toBe(false);
  const binary = { ...effect, ...patchEffectParameter(effect, field("method"), "bayer8") };
  expect(isEffectParameterVisible(binary, field("levels"))).toBe(false);
  expect(isEffectParameterVisible(binary, field("strength"))).toBe(true);
  const fixed = { ...effect, ...patchEffectParameter(effect, field("method"), "threshold") };
  expect(isEffectParameterVisible(fixed, field("strength"))).toBe(false);
  expect(() => patchEffectParameter(effect, field("method"), "unknown")).toThrow();
});

test("shared method/palette controls validate and round-trip in a single undoable edit", () => {
  const effect = createEffect("dither"),
    layer = createLayer("rectangle", { effects: [effect] });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  const changed = { ...effect, ...patchEffectParameter(effect, field("method"), "bayer4") };
  const palette = { ...changed, ...patchEffectParameter(changed, field("foreground"), "#ff2288") };
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { effects: [palette] } });
  const portable = parseProject(serializeProject(engine.getSnapshot().project));
  expect(portable.pages[0]!.layers[0]!.effects[0]).toEqual(palette);
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]).toEqual(effect);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]).toEqual(palette);
});
