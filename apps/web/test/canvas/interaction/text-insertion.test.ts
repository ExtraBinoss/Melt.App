import { expect, test } from "vitest";
import { createPage, createProject, EditorEngine } from "@musart/core";
import { completeDrawing, resizeDrawing } from "../../../src/canvas/interaction/drawing";
import { createTextDrawing, commitDrawing } from "../../../src/canvas/interaction/text-insertion";
import { subscribeEditorNotices } from "../../../src/components/notifications/source";

test.each(["2d", "3d"] as const)(
  "%s text is placed at the chosen canvas point and undoes its scene atomically",
  (mode) => {
    const project = createProject({ pages: [createPage({ width: 800, height: 600 })] });
    const engine = new EditorEngine(project);
    const messages: string[] = [];
    const unsubscribe = subscribeEditorNotices(engine, (notice) => messages.push(notice.message));
    const draft = createTextDrawing({ x: 73, y: 116 }, "New text", mode);
    expect(engine.getSnapshot().project).toEqual(project);
    const shape = completeDrawing(draft, false);
    commitDrawing(engine, shape);
    const page = engine.getSnapshot().project.pages[0]!;
    expect(page.layers[0]).toMatchObject({
      x: 73,
      y: 116,
      width: 360,
      height: 100,
      text: "New text",
    });
    expect(Boolean(page.spatial)).toBe(mode === "3d");
    expect(page.layers[0]!.spatial?.source).toBe(mode === "3d" ? "extrude" : undefined);
    expect(engine.getSnapshot().selection).toEqual([shape.id]);
    expect(messages).toHaveLength(1);
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(project);
    expect(engine.getSnapshot().canUndo).toBe(false);
    engine.redo();
    expect(engine.getSnapshot().project.pages[0]).toEqual(page);
    unsubscribe();
  },
);

test("dragged native text preserves its authored frame and the existing scene", () => {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ width: 800, height: 600 })] }),
  );
  const first = completeDrawing(createTextDrawing({ x: 10, y: 20 }, "First", "3d"), false);
  commitDrawing(engine, first);
  const scene = engine.getSnapshot().project.pages[0]!.spatial;
  const second = resizeDrawing(
    createTextDrawing({ x: 200, y: 180 }, "Second", "3d"),
    { x: 200, y: 180 },
    { x: 90, y: 240 },
    false,
  );
  commitDrawing(engine, completeDrawing(second, true));
  const page = engine.getSnapshot().project.pages[0]!;
  expect(page.spatial).toEqual(scene);
  expect(page.layers.at(-1)).toMatchObject({ x: 90, y: 180, width: 110, height: 60 });
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.layers).toEqual([first]);
});
