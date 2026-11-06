import { expect, it } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { paletteApplication } from "../../../src/services/palettes/application";

function fixture() {
  return new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          layers: [
            createLayer("rectangle", { id: "one", fill: "#ffffff" }),
            createLayer("rectangle", { id: "two", fill: "#ffffff" }),
            createLayer("rectangle", { id: "untouched", fill: "#aabbcc" }),
          ],
        }),
      ],
    }),
  );
}
it("reuses a chosen document ink across objects without duplicate globals, propagates edits and undoes atomically", () => {
  const engine = fixture();
  const initial = engine.getSnapshot().project;
  const swatch = { id: "detected-aabbcc", name: "Ink", value: "#aabbcc" };
  const target = (layerId: string) => [{ pageId: "page", layerId, property: "fill" }];
  engine.transaction(paletteApplication(engine.getSnapshot(), swatch, target("one"), true));
  const first = engine.getSnapshot().project;
  const id = first.colors![0]!.id;
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  engine.transaction(
    paletteApplication(engine.getSnapshot(), { ...swatch, value: "#ABC" }, target("two"), true),
  );
  expect(engine.getSnapshot().project.colors).toHaveLength(1);
  expect(
    engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(0, 2)
      .map((layer) => layer.colorLinks?.fill),
  ).toEqual([id, id]);
  engine.execute({ type: "setDocumentColors", colors: [{ id, name: "Ink", value: "#112233" }] });
  expect(engine.getSnapshot().project.pages[0]!.layers.map((layer) => layer.fill)).toEqual([
    "#112233",
    "#112233",
    "#aabbcc",
  ]);
  engine.undo();
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(first);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(initial);
});
it("keeps a saved palette identity when its value matches another palette's ink", () => {
  const engine = fixture();
  const target = [{ pageId: "page", layerId: "one", property: "fill" }];
  for (const id of ["brand-one", "brand-two"])
    engine.transaction(
      paletteApplication(engine.getSnapshot(), { id, name: id, value: "#aabbcc" }, target, false),
    );
  expect(engine.getSnapshot().project.colors).toHaveLength(2);
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.colorLinks?.fill).toBe("brand-two");
});
