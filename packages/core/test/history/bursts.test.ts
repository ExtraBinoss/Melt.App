import { expect, it } from "vitest";
import { createLayer } from "../../src/index";
import { fixture } from "./support";

it("restores every retained transaction through repeated full undo/redo bursts and clears only a real branch", () => {
  const d = fixture(
    Array.from({ length: 200 }, (_, index) =>
      createLayer("rectangle", { id: `item-${index}`, x: index }),
    ),
  );
  const snapshots = [d.engine.getSnapshot().project];
  for (let value = 1; value <= 40; value++) {
    d.engine.transaction([
      { type: "updateLayers", ids: ["item-0"], patch: { x: value } },
      { type: "updateLayers", ids: ["item-199"], patch: { opacity: value / 40 } },
    ]);
    snapshots.push(d.engine.getSnapshot().project);
  }
  for (let burst = 0; burst < 5; burst++) {
    for (let value = 39; value >= 0; value--) {
      d.engine.undo();
      expect(d.engine.getSnapshot().project).toBe(snapshots[value]);
    }
    expect(d.engine.getSnapshot().canUndo).toBe(false);
    for (let value = 1; value <= 40; value++) {
      d.engine.redo();
      expect(d.engine.getSnapshot().project).toBe(snapshots[value]);
    }
    expect(d.engine.getSnapshot().canRedo).toBe(false);
  }
  d.engine.undo();
  const before = d.engine.getSnapshot();
  const cancelled = d.engine.reserveTransaction([{ type: "renameProject", name: "Cancelled" }]);
  expect(() => d.engine.undo()).toThrow();
  cancelled.cancel();
  expect(d.engine.getSnapshot()).toBe(before);
  expect(() =>
    d.engine.transaction([
      { type: "updateLayers", ids: ["item-0"], patch: { x: 999 } },
      { type: "updateLayers", ids: ["item-199"], patch: { width: -1 } },
    ]),
  ).toThrow();
  expect(d.engine.getSnapshot()).toBe(before);
  d.engine.redo();
  expect(d.engine.getSnapshot().project).toBe(snapshots[40]);
  d.engine.undo();
  d.engine.execute({ type: "renameProject", name: "Branch" });
  expect(d.engine.getSnapshot().canRedo).toBe(false);
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(snapshots[39]);
});
