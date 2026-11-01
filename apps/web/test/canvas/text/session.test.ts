import { expect, test, vi } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  planMotionInitialization,
} from "@musart/core";
import { createCanvasTextSession } from "../../../src/canvas/text/session";
import { createMotionTransport } from "../../../src/services/motion/transport";

function fixture() {
  const layer = createLayer("text", { text: "Original" });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  engine.select([layer.id]);
  return { layer, engine };
}

test("typing previews multiline text without document writes and commits once with undo/redo", () => {
  const { layer, engine } = fixture(),
    preview = vi.fn(),
    clear = vi.fn(),
    session = createCanvasTextSession(engine, layer, preview, clear),
    before = engine.getSnapshot();
  session.preview("First");
  session.preview("First\nSecond");
  expect(preview).toHaveBeenLastCalledWith({ text: "First\nSecond" });
  expect(engine.getSnapshot()).toBe(before);
  session.commit();
  session.commit();
  expect(clear).toHaveBeenCalledTimes(1);
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.text).toBe("First\nSecond");
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.text).toBe("First\nSecond");
});

test("cancel and unchanged text clear the preview without a canonical write", () => {
  const { layer, engine } = fixture(),
    before = engine.getSnapshot(),
    clear = vi.fn();
  const cancelled = createCanvasTextSession(engine, layer, vi.fn(), clear);
  cancelled.preview("Discard");
  cancelled.cancel();
  cancelled.commit();
  createCanvasTextSession(engine, layer, vi.fn(), clear).commit();
  expect(engine.getSnapshot()).toBe(before);
  expect(clear).toHaveBeenCalledTimes(2);
});

test.each(["selection", "revision", "page", "project"])("rejects a stale %s edit", (change) => {
  const { layer, engine } = fixture(),
    clear = vi.fn();
  const session = createCanvasTextSession(engine, layer, vi.fn(), clear);
  session.preview("Stale");
  if (change === "selection") engine.select([]);
  if (change === "revision") engine.execute({ type: "updatePage", patch: { name: "Changed" } });
  if (change === "page") engine.execute({ type: "addPage", page: createPage() });
  if (change === "project")
    engine.load(createProject({ pages: [createPage({ layers: [layer] })] }));
  const after = engine.getSnapshot();
  session.commit();
  expect(engine.getSnapshot()).toBe(after);
  expect(clear).toHaveBeenCalledTimes(1);
});

test("keyed Motion text uses the captured time and rejects a later seek", () => {
  const { layer, engine } = fixture();
  engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(engine.getSnapshot()),
  });
  const target = { kind: "layer" as const, layerId: layer.id, property: "text" as const };
  engine.transaction([
    { type: "upsertMotionKeyframe", target, time: { value: 0, rate: 1 }, value: "Start" },
    { type: "upsertMotionKeyframe", target, time: { value: 1, rate: 1 }, value: "End" },
  ]);
  const transport = createMotionTransport(engine);
  transport.seek({ value: 1, rate: 1 });
  const before = engine.getSnapshot();
  const session = createCanvasTextSession(
    engine,
    transport.readFrame()!.layers[0]!,
    vi.fn(),
    vi.fn(),
  );
  session.preview("Edited");
  session.commit();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.text).toBe("Original");
  expect(transport.readFrame()!.layers[0]!.text).toBe("Edited");
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
  const stale = createCanvasTextSession(
    engine,
    transport.readFrame()!.layers[0]!,
    vi.fn(),
    vi.fn(),
  );
  stale.preview("Discard");
  transport.seek({ value: 0, rate: 1 });
  const after = engine.getSnapshot();
  stale.commit();
  expect(engine.getSnapshot()).toBe(after);
  transport.dispose();
});
