import { expect, it, vi } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type CommandCommitInfo,
  type EnginePort,
} from "@musart/core";
import {
  observeHistoryNotices,
  type HistoryNoticeValue,
} from "../../../../src/components/notifications/history/source";
function fixture(observe = true) {
  const engine = new EditorEngine(
      createProject({
        pages: [
          createPage({
            id: "active",
            layers: [createLayer("rectangle", { id: "item", fill: "#8b5cf6" })],
          }),
          createPage({ id: "inactive", background: "#123456" }),
        ],
      }),
    ),
    publish = vi.fn<(notice: HistoryNoticeValue | null) => void>(),
    stop = observe ? observeHistoryNotices(engine, publish) : () => {};
  return { engine, publish, stop };
}
const property = (key: string, before: unknown, after: unknown) =>
  expect.objectContaining({
    kind: "property",
    target: expect.objectContaining({ property: key }),
    before: { kind: "scalar", value: before },
    after: { kind: "scalar", value: after },
  });
it("forwards authoritative background metadata for an inactive composition without subscribing to detailed commands", () => {
  const d = fixture(),
    detailed = vi.spyOn(d.engine, "subscribeCommands");
  d.engine.select(["item"]);
  d.engine.undo();
  expect(d.publish).not.toHaveBeenCalled();
  d.engine.execute({ type: "updatePage", targetId: "inactive", patch: { background: "#ff0000" } });
  expect(d.publish).not.toHaveBeenCalled();
  d.engine.undo();
  expect(d.publish).toHaveBeenLastCalledWith(
    expect.objectContaining({
      direction: "undo",
      description: {
        changes: [property("background", "#123456", "#ff0000")],
        additionalChanges: false,
      },
    }),
  );
  const retained = d.publish.mock.calls.at(-1)![0]!.description;
  d.engine.redo();
  expect(d.publish.mock.calls.at(-1)![0]!.description).toBe(retained);
  expect(d.publish.mock.calls.at(-1)![0]!.direction).toBe("redo");
  expect(detailed).not.toHaveBeenCalled();
  d.stop();
  d.engine.undo();
  expect(d.publish).toHaveBeenCalledTimes(2);
});
it("groups completed transactions and preserves each exact restored value", () => {
  const d = fixture();
  d.engine.transaction([
    { type: "updateLayers", ids: ["item"], patch: { fill: "#ff0000" } },
    { type: "updateLayers", ids: ["item"], patch: { opacity: 0.12345 } },
    { type: "updateLayers", ids: ["item"], patch: { rotation: 12.75 } },
  ]);
  d.engine.undo();
  expect(d.publish).toHaveBeenCalledTimes(1);
  expect(d.publish.mock.calls[0]![0]!.description?.changes).toEqual([
    property("fill", "#8b5cf6", "#ff0000"),
    property("opacity", 1, 0.12345),
    property("rotation", 0, 12.75),
  ]);
  d.stop();
});
it("can describe entries predating observation, clears redo branches and clears visible notices on load", () => {
  const d = fixture(false);
  d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { fill: "#ff0000" } });
  const stop = observeHistoryNotices(d.engine, d.publish);
  d.engine.undo();
  expect(d.publish.mock.calls.at(-1)![0]!.description?.changes).toEqual([
    property("fill", "#8b5cf6", "#ff0000"),
  ]);
  d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { x: 50 } });
  d.engine.redo();
  expect(d.publish).toHaveBeenCalledTimes(1);
  d.engine.undo();
  expect(d.publish.mock.calls.at(-1)![0]!.description?.changes).toEqual([property("x", 80, 50)]);
  d.engine.load(createProject());
  expect(d.publish).toHaveBeenLastCalledWith(null);
  stop();
});
it("uses immutable deleted-owner metadata and respects the engine's actual history limit", () => {
  const d = fixture();
  d.engine.execute({ type: "deleteLayers", ids: ["item"] });
  d.engine.undo();
  expect(d.publish.mock.calls.at(-1)![0]!.description?.changes).toContainEqual({
    kind: "action",
    action: "delete",
    owner: { kind: "layer", compositionId: "active", layerId: "item" },
  });
  for (let n = 0; n < 110; n++)
    d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { rotation: n + 1 } });
  d.publish.mockClear();
  for (let n = 0; n < 110; n++) d.engine.undo();
  expect(d.publish).toHaveBeenCalledTimes(100);
  expect(
    d.publish.mock.calls.every(([notice]) => notice?.description?.changes[0]?.kind === "property"),
  ).toBe(true);
  d.stop();
});
it("retains bounded real object names across add/delete, branching, renaming and observer remounts", () => {
  const d = fixture(),
    layer = createLayer("text", { id: "word", name: "MELT" });
  d.engine.execute({ type: "addLayers", layers: [layer] });
  d.engine.undo();
  expect(d.publish.mock.calls.at(-1)![0]!.owners).toEqual(["MELT"]);
  d.engine.redo();
  expect(d.publish.mock.calls.at(-1)![0]!.owners).toEqual(["MELT"]);
  d.engine.execute({ type: "deleteLayers", ids: [layer.id] });
  d.stop();
  const stop = observeHistoryNotices(d.engine, d.publish);
  d.engine.undo();
  expect(d.publish.mock.calls.at(-1)![0]!.owners).toEqual(["MELT"]);
  d.engine.execute({ type: "updateLayers", ids: [layer.id], patch: { name: "😀".repeat(125) } });
  d.engine.undo();
  expect(d.publish.mock.calls.at(-1)![0]!.owners).toEqual([`${"😀".repeat(120)}…`]);
  stop();
});
it("leaves missing/custom metadata genuinely absent and cleans up the lightweight subscription", () => {
  const d = fixture(false);
  let listener: ((event: CommandCommitInfo) => void) | undefined;
  const unsubscribe = vi.fn(),
    custom: EnginePort & {
      subscribeCommitInfo: (next: (event: CommandCommitInfo) => void) => () => void;
    } = {
      getSnapshot: () => d.engine.getSnapshot(),
      subscribe: (next) => d.engine.subscribe(next),
      execute: (command) => d.engine.execute(command),
      select: (ids) => d.engine.select(ids),
      setPage: (id) => d.engine.setPage(id),
      undo: () => d.engine.undo(),
      redo: () => d.engine.redo(),
      load: (project) => d.engine.load(project),
      transaction: (commands) => d.engine.transaction(commands),
      subscribeCommitInfo: (next) => {
        listener = next;
        return unsubscribe;
      },
    };
  const stop = observeHistoryNotices(custom, d.publish);
  listener!({ kind: "undo", types: [], snapshot: d.engine.getSnapshot() });
  expect(d.publish).toHaveBeenLastCalledWith({ description: undefined, direction: "undo", id: 1 });
  stop();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(observeHistoryNotices({} as EnginePort, d.publish)).toBeTypeOf("function");
});
