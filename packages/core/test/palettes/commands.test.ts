import { expect, it } from "vitest";
import {
  EditorEngine,
  createEffect,
  createLayer,
  createPage,
  createProject,
  validateProject,
  copyContent,
  parseClipboard,
  pasteContent,
} from "../../src/index";
const global = { id: "brand-red", name: "Brand", value: "#d04c36" };
function setup() {
  const effect = createEffect("shadow", { id: "shadow", settings: { shadowColor: global.value } });
  const project = createProject({
    id: "source",
    colors: [global],
    pages: [
      createPage({
        id: "page",
        layers: [
          createLayer("rectangle", { id: "one", fill: global.value, effects: [effect] }),
          createLayer("rectangle", { id: "two", fill: global.value }),
        ],
      }),
    ],
  });
  const engine = new EditorEngine(project);
  engine.execute({
    type: "linkDocumentColor",
    targets: [
      { pageId: "page", layerId: "one", property: "fill" },
      { pageId: "page", layerId: "one", effectId: "shadow", property: "shadowColor" },
    ],
    colorId: global.id,
  });
  return engine;
}
it("updates only explicit links atomically, keeps equal local literals independent, and restores values and links with undo/reload", () => {
  const engine = setup(),
    before = engine.getSnapshot().project;
  engine.execute({ type: "setDocumentColors", colors: [{ ...global, value: "#263f52" }] });
  const changed = engine.getSnapshot().project,
    layers = changed.pages[0]!.layers;
  expect(layers[0]!.fill).toBe("#263f52");
  expect(layers[0]!.effects[0]!.settings!.shadowColor).toBe("#263f52");
  expect(layers[1]!.fill).toBe(global.value);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(changed);
  expect(new EditorEngine(JSON.parse(JSON.stringify(changed))).getSnapshot().project).toEqual(
    changed,
  );
  engine.execute({
    type: "linkDocumentColor",
    targets: [{ pageId: "page", layerId: "one", property: "fill" }],
    colorId: null,
  });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe("#263f52");
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.colorLinks).toBeUndefined();
  engine.execute({ type: "deleteDocumentColor", id: global.id });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings!.shadowColor).toBe(
    "#263f52",
  );
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.colorLinks).toBeUndefined();
});
it("detaches literal edits, preserves duplicate links, and rejects invalid targets without partial writes", () => {
  const engine = setup();
  engine.execute({ type: "duplicateLayers", ids: ["one"], inPlace: true });
  expect(
    engine
      .getSnapshot()
      .project.pages[0]!.layers.find((layer) => layer.id !== "one" && layer.id !== "two")!
      .colorLinks,
  ).toEqual({
    fill: global.id,
  });
  engine.execute({ type: "updateLayers", ids: ["one"], patch: { fill: "#112233" } });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.colorLinks).toBeUndefined();
  const before = engine.getSnapshot();
  expect(() =>
    engine.transaction([
      { type: "setDocumentColors", colors: [{ ...global, value: "#ffffff" }] },
      {
        type: "linkDocumentColor",
        targets: [{ pageId: "page", layerId: "missing", property: "fill" }],
        colorId: global.id,
      },
    ]),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  const invalid = structuredClone(before.project);
  invalid.pages[0]!.layers[0]!.colorLinks = { fill: "missing" };
  expect(() => validateProject(invalid)).toThrow();
});
it("copies document globals as identity-remapped dependencies across projects and keeps one undo entry", () => {
  const source = setup();
  source.select(["one"]);
  const destination = new EditorEngine(
    createProject({
      id: "destination",
      colors: [{ ...global, value: "#000000" }],
      pages: [createPage({ id: "destination-page" })],
    }),
  );
  const before = destination.getSnapshot().project;
  const content = parseClipboard(copyContent(source.getSnapshot()), before);
  let sequence = 0;
  const pasted = pasteContent(content, before, { x: 100, y: 100 }, () => `pasted-${++sequence}`);
  destination.transaction(pasted.commands);
  const current = destination.getSnapshot().project,
    layer = current.pages[0]!.layers[0]!;
  const id = layer.colorLinks!.fill!;
  expect(id).not.toBe(global.id);
  expect(layer.fill).toBe(global.value);
  expect(layer.effects[0]!.colorLinks!.shadowColor).toBe(id);
  expect(current.colors!.find((color) => color.id === id)!.value).toBe(global.value);
  expect(current.colors!.find((color) => color.id === global.id)!.value).toBe("#000000");
  destination.undo();
  expect(destination.getSnapshot().project).toEqual(before);
  destination.redo();
  expect(destination.getSnapshot().project).toEqual(current);
});
