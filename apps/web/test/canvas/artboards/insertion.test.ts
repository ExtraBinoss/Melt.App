import { expect, it } from "vitest";
import {
  createPage,
  createProject,
  EditorEngine,
  serializeProject,
  parseProject,
} from "@musart/core";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
import {
  artboardInsertions,
  insertArtboard,
  insertionButton,
} from "../../../src/canvas/artboards/insertion";

it("adds in every free direction, keeps existing positions, persists and undoes the whole insertion once", () => {
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const project = createProject({
        pages: [
          createPage({
            id: "origin",
            width: 200,
            height: 160,
            colorSpace: "cmyk",
            background: "#ffffff",
          }),
        ],
      }),
      engine = new EditorEngine(project);
    const layout = arrangeArtboards(project.pages),
      candidate = artboardInsertions(layout).find((item) => item.side === side)!;
    expect(insertionButton(candidate, layout, { x: 0, y: 0, zoom: 1 })).toEqual({
      x: side === "right" ? 134 : side === "left" ? -134 : 0,
      y: side === "top" ? -132 : side === "bottom" ? 114 : 0,
    });
    const id = insertArtboard(engine, layout, candidate, "New artboard"),
      after = engine.getSnapshot();
    expect(after.pageId).toBe(id);
    expect(after.project.pages[1]).toMatchObject({
      width: 200,
      height: 160,
      colorSpace: "cmyk",
      background: "#ffffff",
      layers: [],
      canvasPosition: { x: candidate.x, y: candidate.y },
    });
    expect(after.project.pages[0]!.canvasPosition).toEqual({ x: 0, y: 0 });
    expect(project.pages[0]!.canvasPosition).toBeUndefined();
    const reload = parseProject(serializeProject(after.project)),
      next = arrangeArtboards(reload.pages);
    const original = next.boards.find((board) => board.id === "origin")!,
      added = next.boards.find((board) => board.id === id)!;
    expect(added.x - original.x).toBe(candidate.x);
    expect(added.y - original.y).toBe(candidate.y);
    expect(
      artboardInsertions(next).some((item) => item.sourceId === "origin" && item.side === side),
    ).toBe(false);
    engine.undo();
    expect(engine.getSnapshot().project.pages).toEqual(project.pages);
    expect(engine.getSnapshot().canUndo).toBe(false);
    engine.redo();
    expect(engine.getSnapshot().project.pages[1]!.id).toBe(id);
  }
});

it("rejects occupied neighbors and places legacy additions outside positioned artboards", () => {
  const pages = [
    createPage({ id: "a", width: 200, height: 160, canvasPosition: { x: -328, y: 0 } }),
    createPage({ id: "b", width: 200, height: 160, canvasPosition: { x: 0, y: 0 } }),
  ];
  const layout = arrangeArtboards(pages);
  expect(layout.origin).toEqual({ x: -328, y: 0 });
  expect(
    artboardInsertions(layout).some((item) => item.sourceId === "a" && item.side === "right"),
  ).toBe(false);
  const mixed = arrangeArtboards([...pages, createPage({ id: "legacy", width: 200, height: 160 })]);
  const legacy = mixed.boards.find((board) => board.id === "legacy")!;
  expect(
    mixed.boards
      .filter((board) => board.id !== legacy.id)
      .every(
        (board) =>
          legacy.x >= board.x + board.width ||
          legacy.x + legacy.width <= board.x ||
          legacy.y >= board.y + board.height ||
          legacy.y + legacy.height <= board.y,
      ),
  ).toBe(true);
  const engine = new EditorEngine(createProject({ pages }));
  expect(() =>
    insertArtboard(
      engine,
      layout,
      { sourceId: "a", side: "right", x: 328, y: 0, width: 200, height: 160 },
      "Blocked",
    ),
  ).toThrow();
  expect(engine.getSnapshot().project.pages).toHaveLength(2);
});
