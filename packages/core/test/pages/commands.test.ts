import { it, expect } from "vitest";
import { setup } from "../support/fixture";
import { createPage, serializeProject, parseProject } from "../../src/index";
it("updates additive page settings without accepting structural identity edits", () => {
  const { engine, page } = setup();
  engine.execute({
    type: "updatePage",
    patch: {
      rulers: true,
      colorSpace: "display-p3",
      margins: { top: 10, right: 20, bottom: 30, left: 40 },
    },
  });
  expect(page()).toMatchObject({ rulers: true, colorSpace: "display-p3", margins: { left: 40 } });
  const before = engine.getSnapshot();
  expect(() => engine.execute({ type: "updatePage", patch: { layers: [] } })).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  engine.undo();
  expect(page().rulers).toBeUndefined();
});

it("persists targeted artboard placement atomically without mutating another page or prior snapshots", () => {
  const { engine } = setup();
  const added = createPage({ id: "placed-page" });
  engine.execute({ type: "addPage", page: added });
  const before = engine.getSnapshot(),
    other = before.project.pages[0]!;
  engine.execute({
    type: "updatePage",
    targetId: other.id,
    patch: { canvasPosition: { x: -500, y: 200 } },
  });
  expect(before.project.pages[0]!.canvasPosition).toBeUndefined();
  expect(engine.getSnapshot().pageId).toBe(added.id);
  expect(engine.getSnapshot().project.pages[1]).toBe(before.project.pages[1]);
  const saved = parseProject(serializeProject(engine.getSnapshot().project));
  expect(saved.pages[0]!.canvasPosition).toEqual({ x: -500, y: 200 });
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.canvasPosition).toBeUndefined();
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.canvasPosition?.x).toBe(-500);
  const stable = engine.getSnapshot();
  for (const canvasPosition of [
    { x: NaN, y: 0 },
    { x: 0, y: Infinity },
    { x: 1_000_001, y: 0 },
  ]) {
    expect(() =>
      engine.execute({ type: "updatePage", targetId: other.id, patch: { canvasPosition } }),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(stable);
  }
  expect(() =>
    engine.transaction([
      { type: "updatePage", targetId: other.id, patch: { canvasPosition: { x: 0, y: 0 } } },
      { type: "updatePage", targetId: "gone", patch: { canvasPosition: { x: 0, y: 0 } } },
    ]),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(stable);
});
