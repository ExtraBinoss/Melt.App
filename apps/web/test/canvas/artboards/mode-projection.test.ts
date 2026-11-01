import { expect, it } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { createArtboardModeProjection } from "../../../src/canvas/artboards/mode-projection";

it("retains only unchanged primitive mode state across artwork edits and undo/redo", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ id: "page", layers: [createLayer("rectangle", { id: "shape" })] })],
    }),
  );
  const select = createArtboardModeProjection();
  const initial = select(engine.getSnapshot());
  engine.execute({ type: "updateLayers", ids: ["shape"], patch: { x: 123 } });
  expect(select(engine.getSnapshot())).toBe(initial);
  engine.undo();
  expect(select(engine.getSnapshot())).toBe(initial);
  engine.redo();
  expect(select(engine.getSnapshot())).toBe(initial);
  engine.execute({ type: "updatePage", patch: { name: "Changed", background: "#123456" } });
  expect(select(engine.getSnapshot())).toBe(initial);
  expect(initial).toEqual({
    projectId: engine.getSnapshot().project.id,
    pageId: "page",
    pages: [{ id: "page", mode: "static", initialized: false }],
  });
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const motion = select(engine.getSnapshot());
  expect(motion).not.toBe(initial);
  expect(motion.pages[0]).toEqual({ id: "page", mode: "motion", initialized: true });
  engine.execute({ type: "setCompositionMode", mode: "static" });
  expect(select(engine.getSnapshot()).pages[0]).toEqual({
    id: "page",
    mode: "static",
    initialized: true,
  });
});

it("publishes current mode owners, inserted/deleted pages and project replacements", () => {
  const engine = new EditorEngine(createProject({ pages: [createPage({ id: "first" })] }));
  const select = createArtboardModeProjection();
  const initial = select(engine.getSnapshot());
  engine.execute({ type: "addPage", page: createPage({ id: "second" }) });
  const inserted = select(engine.getSnapshot());
  expect(inserted).not.toBe(initial);
  expect(inserted.pages.map((page) => page.id)).toEqual(["first", "second"]);
  engine.setPage("first");
  const activated = select(engine.getSnapshot());
  expect(activated.pageId).toBe("first");
  expect(activated).not.toBe(inserted);
  engine.execute({ type: "deletePage", id: "second" });
  expect(select(engine.getSnapshot()).pages).toHaveLength(1);
  engine.load(createProject({ id: "replacement", pages: [createPage({ id: "first" })] }));
  expect(select(engine.getSnapshot()).projectId).toBe("replacement");
});
