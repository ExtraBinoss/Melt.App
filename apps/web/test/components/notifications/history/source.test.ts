import { expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { observeHistoryNotices } from "../../../../src/components/notifications/history/source";
function fixture() {
  const engine = new EditorEngine(
      createProject({
        pages: [
          createPage({ layers: [createLayer("rectangle", { id: "item", fill: "#8b5cf6" })] }),
        ],
      }),
    ),
    publish = vi.fn(),
    stop = observeHistoryNotices(engine, publish);
  return { engine, publish, stop };
}
it("describes the restored/reapplied color via the lightweight port, groups a transaction and ignores selection/noops", () => {
  const d = fixture(),
    detailed = vi.spyOn(d.engine, "subscribeCommands");
  d.engine.select(["item"]);
  d.engine.undo();
  expect(d.publish).not.toHaveBeenCalled();
  d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { fill: "#ff0000" } });
  expect(d.publish).not.toHaveBeenCalled();
  d.engine.undo();
  expect(d.publish).toHaveBeenLastCalledWith(
    expect.objectContaining({
      direction: "undo",
      action: "color",
      before: "#8b5cf6",
      after: "#ff0000",
    }),
  );
  d.engine.redo();
  expect(d.publish).toHaveBeenLastCalledWith(
    expect.objectContaining({ direction: "redo", action: "color" }),
  );
  d.engine.transaction([
    { type: "updateLayers", ids: ["item"], patch: { x: 30 } },
    { type: "updateLayers", ids: ["item"], patch: { rotation: 45 } },
  ]);
  d.engine.undo();
  expect(d.publish).toHaveBeenLastCalledWith(expect.objectContaining({ action: "transform" }));
  expect(d.publish).toHaveBeenCalledTimes(3);
  expect(detailed).not.toHaveBeenCalled();
  d.stop();
  d.engine.redo();
  expect(d.publish).toHaveBeenCalledTimes(3);
});
it("does not invent a single restored color for multiple different fills", () => {
  const d = fixture();
  d.engine.execute({
    type: "addLayers",
    layers: [createLayer("rectangle", { id: "other", fill: "#00ff00" })],
  });
  d.engine.execute({ type: "updateLayers", ids: ["item", "other"], patch: { fill: "#ffffff" } });
  d.engine.undo();
  expect(d.publish).toHaveBeenLastCalledWith(
    expect.objectContaining({ action: "color", after: "#ffffff" }),
  );
  expect(d.publish.mock.calls.at(-1)![0].before).toBeUndefined();
  d.stop();
});
it("discards redo branches, clears project loads and handles history predating the observer safely", () => {
  const d = fixture();
  d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { fill: "#ff0000" } });
  d.engine.undo();
  d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { x: 50 } });
  d.engine.redo();
  expect(d.publish).toHaveBeenCalledTimes(1);
  d.engine.undo();
  expect(d.publish).toHaveBeenLastCalledWith(expect.objectContaining({ action: "transform" }));
  d.engine.load(createProject());
  expect(d.publish).toHaveBeenLastCalledWith(null);
  d.engine.redo();
  expect(d.publish).toHaveBeenCalledTimes(3);
  d.stop();
  const engine = new EditorEngine();
  engine.execute({ type: "renameProject", name: "Before observing" });
  const publish = vi.fn(),
    stop = observeHistoryNotices(engine, publish);
  engine.undo();
  expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ action: "edit" }));
  stop();
});
it("bounds descriptions to the engine's hundred-entry limit and follows undo/redo to the endpoints", () => {
  const d = fixture();
  for (let n = 0; n < 110; n++)
    d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { rotation: n + 1 } });
  for (let n = 0; n < 110; n++) d.engine.undo();
  expect(d.publish).toHaveBeenCalledTimes(100);
  expect(d.publish.mock.calls.every(([notice]) => notice.action === "transform")).toBe(true);
  for (let n = 0; n < 110; n++) d.engine.redo();
  expect(d.publish).toHaveBeenCalledTimes(200);
  d.stop();
});
