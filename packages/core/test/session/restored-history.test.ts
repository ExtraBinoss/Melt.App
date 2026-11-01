import { describe, expect, it, vi } from "vitest";
import { EditorEngine } from "../../src/session/engine";
import { createHistoryRestoration } from "../../src/session/restored-history";
import { createProject } from "../../src/document/factories";
import { recordSession } from "../../src/animation/recording";
import { stateFromProject } from "../../src/animation/state";

function recorded() {
  const engine = new EditorEngine(createProject({ name: "Initial" }));
  const recorder = recordSession(engine);
  engine.transaction([
    { type: "renameProject", name: "One" },
    { type: "renameProject", name: "First transaction" },
  ]);
  engine.execute({ type: "renameProject", name: "Second transaction" });
  engine.undo();
  return { engine, replay: recorder.stop() };
}

describe("durable interactive history hydration", () => {
  it("restores transactions and the redo cursor with one publication and preserves branching", () => {
    const { engine: previous, replay } = recorded();
    const restore = createHistoryRestoration(stateFromProject(replay.initial), replay.pageId);
    for (const event of replay.events) restore.append(event);
    const project = previous.getSnapshot().project;
    const history = restore.finish(project, project.assets);
    const engine = new EditorEngine();
    const commits = vi.fn(),
      publications = vi.fn();
    engine.subscribeCommitInfo(commits);
    engine.subscribe(publications);
    engine.load(project, history);
    expect(publications).toHaveBeenCalledTimes(1);
    expect(commits).toHaveBeenCalledTimes(1);
    expect(commits.mock.calls[0]![0].kind).toBe("load");
    expect(engine.getSnapshot()).toMatchObject({ canUndo: true, canRedo: true });
    engine.redo();
    expect(engine.getSnapshot().project.name).toBe("Second transaction");
    engine.undo();
    engine.undo();
    expect(engine.getSnapshot().project.name).toBe("Initial");
    expect(engine.getSnapshot().canUndo).toBe(false);
    engine.redo();
    engine.execute({ type: "renameProject", name: "New branch" });
    expect(engine.getSnapshot().canRedo).toBe(false);
    engine.undo();
    expect(engine.getSnapshot().project.name).toBe("First transaction");
  });

  it("retains redo when pruning removed its commit and ignores an identical reopen checkpoint", () => {
    const { engine: previous, replay } = recorded();
    const base = createHistoryRestoration(stateFromProject(replay.initial), replay.pageId);
    base.append(replay.events[0]!);
    base.append(replay.events[1]!);
    // The retained journal starts after its old commits, at the second transaction.
    const state = {
      ...stateFromProject(previous.getSnapshot().project),
      name: "Second transaction",
    };
    const restore = createHistoryRestoration(state, replay.pageId);
    restore.append(replay.events[2]!);
    const current = previous.getSnapshot().project;
    restore.append({
      at: 4,
      projectId: current.id,
      pageId: replay.pageId,
      kind: "load",
      commands: [],
      delta: [],
      after: stateFromProject(current),
    });
    const engine = new EditorEngine();
    engine.load(current, restore.finish(current, current.assets));
    expect(engine.getSnapshot()).toMatchObject({ canUndo: false, canRedo: true });
    engine.redo();
    expect(engine.getSnapshot().project.name).toBe("Second transaction");
  });

  it("validates every history frame before replacing the active document or stacks", () => {
    const { engine, replay } = recorded();
    const before = engine.getSnapshot();
    expect(() =>
      engine.load(before.project, {
        pageId: before.pageId,
        past: [{ project: { ...replay.initial, name: "" }, pageId: "missing-page" }],
        future: [],
      }),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(before);
    engine.redo();
    expect(engine.getSnapshot().project.name).toBe("Second transaction");
    const restore = createHistoryRestoration(stateFromProject(replay.initial), replay.pageId);
    expect(() => restore.finish(before.project, {})).toThrow("differs");
  });
});
