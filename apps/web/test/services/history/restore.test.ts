import { expect, it, vi } from "vitest";
import { createProject, EditorEngine, recordSession, type Project } from "@musart/core";
import { ProjectStore } from "../../../src/services/projects/storage";
import { createEditorServices } from "../../../src/services/session/editor-services";
import { createRuntime } from "../../../src/services/session/runtime";
import { SelectionClient } from "../../../src/services/selection/selection";
import { openStudioDatabase } from "../../../src/services/projects/database";
import { projectAt, seed } from "./fixtures";

async function savedHistory(databaseName = crypto.randomUUID()) {
  const store = new ProjectStore(databaseName);
  const initial = createProject({ name: "Initial" });
  await store.create(initial);
  await store.history.ensure(initial, initial.pages[0]!.id);
  const engine = new EditorEngine(initial);
  const recorder = recordSession(engine);
  engine.transaction([
    { type: "renameProject", name: "Intermediate" },
    { type: "renameProject", name: "Transaction" },
  ]);
  engine.execute({ type: "renameProject", name: "Final" });
  engine.undo();
  for (const event of recorder.stop().events)
    await store.history.append(initial.id, event, {}, engine.getSnapshot().project.updatedAt);
  const project = engine.getSnapshot().project;
  await store.saveCurrent(project);
  return { store, project, databaseName };
}
function selection() {
  return new SelectionClient(() => ({
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  }));
}

it("restores a closed project through manual opening and bootstrap, with redo and new branches", async () => {
  const saved = await savedHistory();
  await saved.store.close();
  const store = new ProjectStore(saved.databaseName);
  const engine = new EditorEngine();
  const client = selection();
  const services = createEditorServices(engine, { store, selection: client });
  const publications = vi.fn();
  engine.subscribeCommitInfo(publications);
  try {
    await services.openProject(saved.project.id);
    expect(publications).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot()).toMatchObject({ canUndo: true, canRedo: true });
    engine.redo();
    expect(engine.getSnapshot().project.name).toBe("Final");
    engine.undo();
    engine.undo();
    expect(engine.getSnapshot().project.name).toBe("Initial");
  } finally {
    client.dispose();
    await store.close();
  }
  const onError = vi.fn();
  const runtime = await createRuntime(onError, {
    store: new ProjectStore(saved.databaseName),
    selection: selection(),
    projectId: saved.project.id,
    autosaveDelay: 10000,
  });
  try {
    expect(runtime.engine.getSnapshot()).toMatchObject({ canUndo: true, canRedo: true });
    runtime.engine.execute({ type: "renameProject", name: "Branch after reopen" });
    expect(runtime.engine.getSnapshot().canRedo).toBe(false);
    await runtime.flush();
  } finally {
    await runtime.dispose();
  }
  const reopened = new ProjectStore(saved.databaseName);
  try {
    const project = await reopened.load(saved.project.id);
    const next = new EditorEngine();
    next.load(project, await reopened.history.restore(project));
    expect(next.getSnapshot().canRedo).toBe(false);
    next.undo();
    expect(next.getSnapshot().project.name).toBe("Transaction");
    next.undo();
    expect(next.getSnapshot().project.name).toBe("Initial");
  } finally {
    await reopened.close();
  }
  expect(onError).not.toHaveBeenCalled();
});

it("allows unrecorded edits without inventing undo and rejects deleted or stale input", async () => {
  const { store, project } = await savedHistory();
  try {
    await store.history.configure(project.id, { enabled: false });
    const changed: Project = { ...project, name: "Unrecorded" };
    await store.saveCurrent(changed);
    expect(await store.history.restore(changed)).toBeUndefined();
    await expect(store.history.restore(project)).rejects.toThrow("changed");
    await store.remove(project.id);
    await expect(store.history.restore(changed)).rejects.toThrow("deleted");
  } finally {
    await store.close();
  }
});

it("opens the actual saved project when retained history is incomplete and reports the real cause", async () => {
  const { store, project, databaseName } = await savedHistory();
  const db = await openStudioDatabase(databaseName);
  await db.delete("journalEvents", [project.id, 0]);
  db.close();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const engine = new EditorEngine(),
    client = selection();
  const services = createEditorServices(engine, { store, selection: client });
  try {
    await services.openProject(project.id);
    expect(engine.getSnapshot()).toMatchObject({
      project: { name: "Transaction" },
      canUndo: false,
      canRedo: false,
    });
    expect(error).toHaveBeenCalledWith(
      "[Melt history restoration failed]",
      { projectId: project.id },
      expect.objectContaining({ message: "History entries are incomplete." }),
    );
  } finally {
    error.mockRestore();
    client.dispose();
    await store.close();
  }
});

it("pages large journals into the existing engine limit and respects the pruned durable base", async () => {
  const store = new ProjectStore(crypto.randomUUID());
  try {
    await store.create(projectAt());
    await store.history.ensure(projectAt(), "page");
    await seed(store.history, 125);
    await store.saveCurrent(projectAt(125));
    const project = await store.load("history-project"),
      engine = new EditorEngine();
    engine.load(project, await store.history.restore(project));
    for (let i = 0; i < 100; i++) engine.undo();
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(25);
    expect(engine.getSnapshot().canUndo).toBe(false);
    await store.history.configure(project.id, { limit: 10 });
    engine.load(project, await store.history.restore(project));
    for (let i = 0; i < 10; i++) engine.undo();
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(115);
    expect(engine.getSnapshot().canUndo).toBe(false);
  } finally {
    await store.close();
  }
});
