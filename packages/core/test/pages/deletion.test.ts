import { expect, it } from "vitest";
import {
  arrangeArtboards,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  parseProject,
  serializeProject,
} from "../../src/index";
const pages = () =>
  Array.from({ length: 4 }, (_, i) =>
    createPage({
      id: `page-${i}`,
      width: 240,
      height: 240,
      layers: [createLayer("rectangle", { id: `item-${i}` })],
    }),
  );
it("deletes once without cloning surviving artwork/assets or clearing an inactive page's selection", () => {
  const engine = new EditorEngine(createProject({ pages: pages() }));
  engine.setPage("page-3");
  engine.select(["item-3"]);
  const before = engine.getSnapshot(),
    layout = arrangeArtboards(before.project.pages);
  engine.execute({ type: "deletePage", id: "page-1" });
  const after = engine.getSnapshot();
  expect(after.pageId).toBe("page-3");
  expect(after.selection).toBe(before.selection);
  expect(after.project.assets).toBe(before.project.assets);
  for (const page of after.project.pages) {
    const original = before.project.pages.find((p) => p.id === page.id)!,
      pos = layout.boards.find((p) => p.id === page.id)!;
    expect(page.layers).toBe(original.layers);
    expect(page.canvasPosition).toEqual({ x: pos.x, y: pos.y });
    expect(original.canvasPosition).toBeUndefined();
  }
  const restored = parseProject(serializeProject(after.project));
  expect(arrangeArtboards(restored.pages)).toEqual(arrangeArtboards(after.project.pages));
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project).toBe(after.project);
});
it("activates the spatially nearest surviving composition with stable tie-breaking, rather than always the first", () => {
  const engine = new EditorEngine(createProject({ pages: pages() }));
  engine.setPage("page-3");
  engine.execute({ type: "deletePage", id: "page-3" });
  expect(engine.getSnapshot().pageId).toBe("page-2");
  engine.undo();
  expect(engine.getSnapshot().pageId).toBe("page-3");
  const distant = pages();
  distant[0]!.canvasPosition = { x: -8000, y: 0 };
  distant[1]!.canvasPosition = { x: 0, y: 0 };
  distant[2]!.canvasPosition = { x: 8000, y: 0 };
  distant[3]!.canvasPosition = { x: 8300, y: 0 };
  engine.load(createProject({ pages: distant }));
  engine.setPage("page-3");
  engine.execute({ type: "deletePage", id: "page-3" });
  expect(engine.getSnapshot().pageId).toBe("page-2");
});
it("keeps positioned pages identical and rejects failed deletions atomically, including mixed workspaces near the coordinate limit", () => {
  const engine = new EditorEngine(
      createProject({
        pages: [
          createPage({ id: "fixed", canvasPosition: { x: 1408, y: 0 } }),
          createPage({ id: "legacy" }),
          createPage({ id: "far", canvasPosition: { x: 1_000_000, y: 0 } }),
          createPage({ id: "other" }),
        ],
      }),
    ),
    before = engine.getSnapshot();
  expect(() => engine.execute({ type: "deletePage", id: "absent" })).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  engine.execute({ type: "deletePage", id: "other" });
  expect(engine.getSnapshot().project.pages[0]).toBe(before.project.pages[0]);
  expect(engine.getSnapshot().project.assets).toBe(before.project.assets);
  engine.execute({ type: "deletePage", id: "legacy" });
  engine.execute({ type: "deletePage", id: "far" });
  const single = engine.getSnapshot();
  expect(() => engine.execute({ type: "deletePage", id: "fixed" })).toThrow();
  expect(engine.getSnapshot()).toBe(single);
});
