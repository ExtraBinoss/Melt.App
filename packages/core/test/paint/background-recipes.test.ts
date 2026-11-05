import { expect, test } from "vitest";
import {
  BACKGROUND_CATEGORIES,
  BACKGROUND_PRESETS,
  backgroundLayer,
  backgroundPresetLayer,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  parseProject,
  serializeProject,
  validateFillGradient,
  type BackgroundPresetOptions,
} from "../../src";

function fixture() {
  const foreground = createLayer("text", { id: "foreground", fill: "#ff1166" });
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          layers: [foreground],
          width: 900,
          height: 600,
          background: "#d8d0ff",
        }),
      ],
    }),
  );
  engine.select([foreground.id]);
  return engine;
}
const recipe = BACKGROUND_PRESETS.find((item) => item.category === "atmosphere")!;

test("65 distinct categorized recipes are portable native paints with editable effect ingredients", () => {
  expect(BACKGROUND_PRESETS).toHaveLength(65);
  expect(new Set(BACKGROUND_PRESETS.map((item) => item.id)).size).toBe(65);
  expect(new Set(BACKGROUND_PRESETS.map((item) => JSON.stringify(item.gradient))).size).toBe(65);
  for (const category of BACKGROUND_CATEGORIES)
    expect(BACKGROUND_PRESETS.filter((item) => item.category === category)).toHaveLength(13);
  for (const item of BACKGROUND_PRESETS)
    expect(() => validateFillGradient(item.gradient)).not.toThrow();
  expect(recipe.effects.map((item) => item.type)).toEqual(["grain", "feather"]);
});

test("headless application preserves foreground/selection/page paint and round-trips an editable layer in one undo", () => {
  const engine = fixture(),
    before = engine.getSnapshot();
  engine.execute({ type: "applyBackgroundPreset", presetId: recipe.id });
  const after = engine.getSnapshot(),
    page = after.project.pages[0]!;
  expect(page.background).toBe(before.project.pages[0]!.background);
  expect(page.layers[1]).toEqual(before.project.pages[0]!.layers[0]);
  expect(after.selection).toEqual(before.selection);
  const background = backgroundLayer(page)!;
  expect(background.fillGradient).toEqual(recipe.gradient);
  expect(background.effects.map((item) => item.type)).toEqual(["grain", "feather"]);
  expect(parseProject(serializeProject(after.project))).toEqual(after.project);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(after.project);
  engine.execute({ type: "updateLayers", ids: [background.id], patch: { effects: [] } });
  expect(backgroundLayer(engine.getSnapshot().project.pages[0]!)!.effects).toEqual([]);
});

test("repeated application reuses the normal layer and allocates deterministic collision-free effect IDs", () => {
  const engines = [fixture(), fixture()];
  for (const engine of engines) {
    engine.execute({ type: "applyBackgroundPreset", presetId: recipe.id });
    const id = backgroundLayer(engine.getSnapshot().project.pages[0]!)!.id;
    engine.execute({
      type: "applyBackgroundPreset",
      presetId: BACKGROUND_PRESETS[0]!.id,
      options: { grain: 0.1, feather: 0.2 },
    });
    const page = engine.getSnapshot().project.pages[0]!;
    expect(page.layers).toHaveLength(2);
    expect(backgroundLayer(page)!.id).toBe(id);
  }
  expect(engines[0]!.getSnapshot().project.pages[0]!.layers.map((item) => item.id)).toEqual(
    engines[1]!.getSnapshot().project.pages[0]!.layers.map((item) => item.id),
  );
  expect(backgroundLayer(engines[0]!.getSnapshot().project.pages[0]!)!.effects).toEqual(
    backgroundLayer(engines[1]!.getSnapshot().project.pages[0]!)!.effects,
  );
});

test("invalid presets, radial overrides and locked backgrounds fail atomically", () => {
  const engine = fixture(),
    before = engine.getSnapshot();
  for (const options of [
    { grain: -1 },
    { feather: 2 },
    { bogus: 1 },
    { gradient: { ...recipe.gradient, radius: 0 } },
  ]) {
    expect(() =>
      engine.execute({
        type: "applyBackgroundPreset",
        presetId: recipe.id,
        options: options as BackgroundPresetOptions,
      }),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(before);
  }
  expect(() => engine.execute({ type: "applyBackgroundPreset", presetId: "missing" })).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  engine.execute({ type: "applyBackgroundPreset", presetId: recipe.id });
  const layer = backgroundLayer(engine.getSnapshot().project.pages[0]!)!;
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { locked: true } });
  const locked = engine.getSnapshot();
  expect(() => engine.execute({ type: "applyBackgroundPreset", presetId: recipe.id })).toThrow();
  expect(engine.getSnapshot()).toBe(locked);
});

test("pure recipe preparation does not mutate page data and accepts explicit native radial controls", () => {
  const page = fixture().getSnapshot().project.pages[0]!,
    before = structuredClone(page);
  let index = 0;
  const layer = backgroundPresetLayer(page, recipe.id, (prefix) => `${prefix}-${index++}`, {
    gradient: {
      ...recipe.gradient,
      centerX: 0.2,
      centerY: 0.8,
      radius: 1.1,
      radialShape: "circle",
    },
    grain: 0,
  });
  expect(page).toEqual(before);
  expect(layer.effects.map((item) => item.type)).toEqual(["feather"]);
  expect(layer.fillGradient).toMatchObject({
    centerX: 0.2,
    centerY: 0.8,
    radius: 1.1,
    radialShape: "circle",
  });
});
