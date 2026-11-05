import { expect, test, vi } from "vitest";
import { EditorEngine } from "@musart/core";
import { getCanonicalPresentation } from "../../../src/state/session/canonical-presentation";
import { createWorkspaceReadiness } from "../../../src/ui/studio/transition/presentation";

function harness() {
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  const paint = () => {
    for (let pass = 0; pass < 2; pass++) {
      const current = [...frames.values()];
      frames.clear();
      for (const callback of current) callback(performance.now());
    }
  };
  const engine = new EditorEngine(),
    root = document.createElement("div");
  root.innerHTML = '<div class="editor-gpu-scene"><canvas></canvas></div>';
  const readiness = createWorkspaceReadiness(engine, () => root);
  const snapshot = engine.getSnapshot();
  const publisher = getCanonicalPresentation(engine).acquire();
  const origin = { projectId: snapshot.project.id, revision: snapshot.revision };
  return { engine, root, readiness, publisher, origin, paint, frames };
}

test("retained acknowledged frames are sufficient after layout, but nested chrome must really resolve", async () => {
  const d = harness(),
    finish = vi.fn(),
    abort = new AbortController();
  const ticket = d.publisher.request(d.origin, true);
  d.publisher.present(ticket);
  const release = d.readiness.pending();
  const wait = d.readiness.ready(abort.signal).then(finish);
  d.paint();
  await Promise.resolve();
  expect(finish).not.toHaveBeenCalled();
  release();
  d.paint();
  await wait;
  expect(finish).toHaveBeenCalledOnce();
  // Completion disconnects its renderer subscription and DOM observer.
  d.publisher.request(d.origin, true);
  expect(d.frames.size).toBe(0);
  d.publisher.release();
});

test("time and layout alone cannot finish while the requested canvas frame is unacknowledged", async () => {
  const d = harness(),
    finish = vi.fn();
  const ticket = d.publisher.request(d.origin, true);
  const wait = d.readiness.ready(new AbortController().signal).then(finish);
  d.paint();
  await Promise.resolve();
  expect(finish).not.toHaveBeenCalled();
  d.publisher.present(ticket);
  d.paint();
  await wait;
  expect(finish).toHaveBeenCalledOnce();
  d.publisher.release();
});

test("active playback uses an actually presented current GPU witness without claiming canonical readiness", async () => {
  const d = harness(),
    finish = vi.fn();
  d.publisher.request(d.origin, false);
  const canvas = d.root.querySelector("canvas")!;
  Object.assign(canvas.dataset, {
    projectId: d.origin.projectId,
    pageId: d.engine.getSnapshot().pageId,
    presentationReady: "true",
    rendererReady: "false",
  });
  const wait = d.readiness.ready(new AbortController().signal).then(finish);
  d.paint();
  await Promise.resolve();
  expect(finish).not.toHaveBeenCalled();
  canvas.dataset.rendererReady = "true";
  await Promise.resolve();
  d.paint();
  await wait;
  expect(finish).toHaveBeenCalledOnce();
  expect(getCanonicalPresentation(d.engine).ready(d.origin)).toBe(false);
  d.publisher.release();
});

test("cancellation removes paint requests and late renderer completions cannot restart readiness", async () => {
  const d = harness(),
    abort = new AbortController();
  const ticket = d.publisher.request(d.origin, true);
  const wait = d.readiness.ready(abort.signal);
  expect(d.frames.size).toBe(1);
  abort.abort();
  await wait;
  expect(d.frames.size).toBe(0);
  d.publisher.present(ticket);
  expect(d.frames.size).toBe(0);
  d.publisher.release();
});
