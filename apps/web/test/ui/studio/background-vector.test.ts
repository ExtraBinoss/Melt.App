import { expect, test } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  parseProject,
  serializeProject,
  createEffect,
} from "@musart/core";
import { SHAPE_CATALOG } from "@musart/assets";
import { backgroundLayer, createBackgroundLayer } from "../../../src/ui/studio/background/model";
import { insertStudioVector } from "../../../src/ui/studio/library/vector";

function fixture() {
  const foreground = createLayer("text", { text: "Hello", id: "foreground" });
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          width: 1200,
          height: 900,
          layers: [foreground],
          background: "#d8d0ff",
          backgroundGradient: {
            kind: "linear",
            angle: 35,
            stops: [
              { offset: 0, color: "#8b5cf6" },
              { offset: 1, color: "#32d393" },
            ],
          },
        }),
      ],
    }),
  );
  engine.select([foreground.id]);
  return engine;
}
test("background conversion preserves the original paint, foreground and selection with one undo entry", () => {
  const engine = fixture();
  const before = engine.getSnapshot();
  const result = createBackgroundLayer(engine, "Background");
  const after = engine.getSnapshot();
  const page = after.project.pages[0]!;
  expect(page.layers[0]).toEqual(result);
  expect(result.fill).toBe(before.project.pages[0]!.background);
  expect(result.fillGradient).toEqual(before.project.pages[0]!.backgroundGradient);
  expect(page.background).toBe("#00000000");
  expect(page.backgroundGradient).toBeUndefined();
  expect(page.layers[1]).toEqual(before.project.pages[0]!.layers[0]);
  expect(after.selection).toEqual(before.selection);
  expect(parseProject(serializeProject(after.project))).toEqual(after.project);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(after.project);
});
test("background remains a regular stackable layer and repeated conversion does not duplicate it", () => {
  const engine = fixture();
  const first = createBackgroundLayer(engine, "Background");
  const revision = engine.getSnapshot().revision;
  expect(createBackgroundLayer(engine, "Other").id).toBe(first.id);
  expect(engine.getSnapshot().revision).toBe(revision);
  engine.execute({
    type: "updateLayers",
    ids: [first.id],
    patch: { effects: [createEffect("blur"), createEffect("grain")] },
  });
  expect(
    backgroundLayer(engine.getSnapshot().project.pages[0]!)?.effects.map((e) => e.type),
  ).toEqual(["blur", "grain"]);
});
test("the background resolver never adopts a transformed, nested or native 3D object", () => {
  const page = createPage({
    layers: [createLayer("rectangle", { x: 0, y: 0, width: 1080, height: 1080, rotation: 5 })],
  });
  expect(backgroundLayer(page)).toBeUndefined();
  expect(
    backgroundLayer({ ...page, layers: [{ ...page.layers[0]!, rotation: 0, parentId: "group" }] }),
  ).toBeUndefined();
});
test("SVG insertion uses one native editable extrusion and undo removes its scene atomically", () => {
  const engine = fixture();
  const before = engine.getSnapshot().project;
  const asset = SHAPE_CATALOG[0]!;
  const layer = insertStudioVector(engine, asset, true);
  const page = engine.getSnapshot().project.pages[0]!;
  expect(layer.kind).toBe("vector");
  expect(layer.spatial).toMatchObject({ enabled: true, source: "extrude", depth: 0.3 });
  expect(layer.vector?.path).toBe(asset.path);
  expect(page.spatial).toBeDefined();
  expect(page.motion).toBeUndefined();
  expect(engine.getSnapshot().selection).toEqual([layer.id]);
  expect(parseProject(serializeProject(engine.getSnapshot().project))).toEqual(
    engine.getSnapshot().project,
  );
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
});
test("flat SVGs remain flat and adding volume retains the existing shared scene", () => {
  const engine = fixture();
  const flat = insertStudioVector(engine, SHAPE_CATALOG[0]!, false);
  expect(flat.spatial).toBeUndefined();
  expect(engine.getSnapshot().project.pages[0]!.spatial).toBeUndefined();
  insertStudioVector(engine, SHAPE_CATALOG[0]!, true);
  const scene = engine.getSnapshot().project.pages[0]!.spatial;
  insertStudioVector(engine, SHAPE_CATALOG[1]!, true);
  expect(engine.getSnapshot().project.pages[0]!.spatial).toEqual(scene);
});
