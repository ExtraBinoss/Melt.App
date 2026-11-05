import { expect, test } from "vitest";
import {
  backgroundLayer,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  parseProject,
  serializeProject,
} from "../../src";

function fixture(name = "Arrière-plan", background?: boolean) {
  const layer = createLayer("rectangle", {
    id: "paint",
    name,
    x: 40,
    y: 20,
    width: 220,
    height: 140,
    ...(background !== undefined ? { background } : {}),
  });
  const page = createPage({ width: 320, height: 240, background: "#8844ff", layers: [layer] });
  return { layer, page, engine: new EditorEngine(createProject({ pages: [page] })) };
}

test("legacy resized backgrounds retain their actual ID and acquire durable ownership on an undoable edit", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  expect(backgroundLayer(d.page)?.id).toBe(d.layer.id);
  d.engine.execute({
    type: "updateLayers",
    ids: [d.layer.id],
    patch: { width: 180, name: "Renamed wall" },
  });
  const page = d.engine.getSnapshot().project.pages[0]!;
  expect(page.layers[0]).toMatchObject({ background: true, width: 180, name: "Renamed wall" });
  expect(backgroundLayer(page)?.id).toBe(d.layer.id);
  expect(page.background).toBe("#8844ff");
  expect(parseProject(serializeProject(d.engine.getSnapshot().project))).toEqual(
    d.engine.getSnapshot().project,
  );
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before);
  d.engine.redo();
  expect(backgroundLayer(d.engine.getSnapshot().project.pages[0]!)?.id).toBe(d.layer.id);
});

test("explicit ownership survives frame resizing, ordinary rectangles and explicit opt-outs stay ordinary", () => {
  expect(backgroundLayer(fixture("Custom", true).page)?.id).toBe("paint");
  expect(backgroundLayer(fixture("Rectangle").page)).toBeUndefined();
  expect(backgroundLayer(fixture("Arrière-plan", false).page)).toBeUndefined();
  const d = fixture();
  expect(backgroundLayer({ ...d.page, layers: [{ ...d.layer, rotation: 10 }] })).toBeUndefined();
  expect(
    backgroundLayer({ ...d.page, layers: [{ ...d.layer, parentId: "group" }] }),
  ).toBeUndefined();
  const before = d.engine.getSnapshot().project;
  expect(() =>
    d.engine.execute({
      type: "updateLayers",
      ids: [d.layer.id],
      patch: { background: "yes" as unknown as boolean },
    }),
  ).toThrow();
  expect(d.engine.getSnapshot().project).toEqual(before);
});

test("ordinary full-frame rectangles remain ordinary during Classic edits", () => {
  const layer = createLayer("rectangle", {
    id: "overlay",
    name: "Rectangle",
    width: 320,
    height: 240,
    opacity: 0.5,
  });
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ width: 320, height: 240, background: "#8844ff", layers: [layer] })],
    }),
  );
  expect(backgroundLayer(engine.getSnapshot().project.pages[0]!, false)).toBeUndefined();
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { opacity: 0.25 } });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.background).toBeUndefined();
  expect(backgroundLayer(engine.getSnapshot().project.pages[0]!, false)).toBeUndefined();
});
