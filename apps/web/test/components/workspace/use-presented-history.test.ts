import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { EditorEngine } from "@musart/core";
import { getCanonicalPresentation } from "../../../src/state/session/canonical-presentation";
import { usePresentedHistory } from "../../../src/components/workspace/use-presented-history";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function admissionClock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("scheduler", undefined);
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  return {
    frames,
    paint() {
      const current = [...frames.values()];
      frames.clear();
      act(() => current.forEach((callback) => callback(performance.now())));
    },
    tasks() {
      void act(() => vi.runOnlyPendingTimers());
    },
  };
}

test("history adopts only after the latest matching draw has presentation opportunities and releases its subscription", () => {
  const clock = admissionClock();
  const engine = new EditorEngine();
  const presentation = getCanonicalPresentation(engine);
  const publisher = presentation.acquire();
  const projectId = engine.getSnapshot().project.id;
  const initial = { label: "initial" };
  const origin = { projectId, revision: 0 };
  publisher.present(publisher.request(origin, true));
  let active = 0;
  const subscribe = presentation.subscribe;
  vi.spyOn(presentation, "subscribe").mockImplementation((listener) => {
    active++;
    const stop = subscribe(listener);
    return () => {
      active--;
      stop();
    };
  });
  const view = renderHook(({ value, origin }) => usePresentedHistory(engine, value, origin), {
    initialProps: { value: initial, origin },
  });
  const undone = { label: "undo" },
    redone = { label: "redo" };
  const undoOrigin = { projectId, revision: 1 },
    redoOrigin = { projectId, revision: 2 };
  view.rerender({ value: undone, origin: undoOrigin });
  expect(view.result.current).toBe(initial);
  const undoTicket = publisher.request(undoOrigin, true);
  view.rerender({ value: redone, origin: redoOrigin });
  const redoTicket = publisher.request(redoOrigin, true);
  act(() => publisher.present(undoTicket));
  expect(view.result.current).toBe(initial);
  expect(clock.frames.size).toBe(0);
  act(() => publisher.present(redoTicket));
  expect(view.result.current).toBe(initial);
  for (let at = 0; at < 3; at++) {
    clock.paint();
    expect(view.result.current).toBe(initial);
  }
  expect(clock.frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(1);
  clock.tasks();
  expect(view.result.current).toBe(redone);
  expect(active).toBe(1);
  view.unmount();
  expect(active).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  publisher.release();
});

test("superseding revisions, ordinary selection and unavailable renderers cancel pending admission", () => {
  const clock = admissionClock();
  const engine = new EditorEngine();
  const presentation = getCanonicalPresentation(engine);
  const publisher = presentation.acquire();
  const projectId = engine.getSnapshot().project.id;
  const initial = { label: "initial" },
    restored = { label: "restored" },
    selected = { label: "fresh selection" };
  const origin = { projectId, revision: 1 };
  const view = renderHook(({ value, origin }) => usePresentedHistory(engine, value, origin), {
    initialProps: { value: initial, origin: origin as typeof origin | null },
  });
  view.rerender({ value: restored, origin });
  act(() => publisher.present(publisher.request(origin, true)));
  clock.paint();
  clock.paint();
  clock.paint();
  expect(vi.getTimerCount()).toBe(1);
  // A newer canonical request must cancel an older task even before its props arrive.
  const newer = { projectId, revision: 2 };
  act(() => publisher.present(publisher.request(newer, true)));
  expect(vi.getTimerCount()).toBe(0);
  clock.tasks();
  expect(view.result.current).toBe(initial);
  view.rerender({ value: restored, origin: newer });
  clock.paint();
  expect(clock.frames.size).toBe(1);
  view.rerender({ value: selected, origin: null });
  expect(view.result.current).toBe(selected);
  expect(clock.frames.size).toBe(0);
  view.rerender({ value: restored, origin: newer });
  clock.paint();
  clock.paint();
  clock.paint();
  expect(vi.getTimerCount()).toBe(1);
  act(() => publisher.unavailable());
  expect(view.result.current).toBe(restored);
  expect(vi.getTimerCount()).toBe(0);
  view.unmount();
  publisher.release();
});

test("reusing an earlier model object for a later revision still waits for its own admission", () => {
  const clock = admissionClock();
  const engine = new EditorEngine();
  const publisher = getCanonicalPresentation(engine).acquire();
  const projectId = engine.getSnapshot().project.id;
  const initial = { label: "initial" },
    edited = { label: "ordinary edit" };
  const initialOrigin = { projectId, revision: 0 };
  const view = renderHook(({ value, origin }) => usePresentedHistory(engine, value, origin), {
    initialProps: { value: initial, origin: initialOrigin as typeof initialOrigin | null },
  });
  view.rerender({ value: edited, origin: null });
  const origin = { projectId, revision: 2 };
  view.rerender({ value: initial, origin });
  expect(view.result.current).toBe(edited);
  act(() => publisher.present(publisher.request(origin, true)));
  clock.paint();
  clock.paint();
  clock.paint();
  expect(view.result.current).toBe(edited);
  clock.tasks();
  expect(view.result.current).toBe(initial);
  view.unmount();
  publisher.release();
});

test("background admission is abortable on project or engine replacement and unmount", () => {
  const clock = admissionClock();
  const tasks: { run: () => void; signal: AbortSignal }[] = [];
  const postTask = vi.fn((run: () => void, options: { signal: AbortSignal }) => {
    tasks.push({ run, signal: options.signal });
    return Promise.resolve();
  });
  vi.stubGlobal("scheduler", { postTask });
  const engine = new EditorEngine();
  const publisher = getCanonicalPresentation(engine).acquire();
  const projectId = engine.getSnapshot().project.id;
  const initial = { label: "initial" },
    restored = { label: "restored" },
    replacement = { label: "replacement" };
  const origin = { projectId, revision: 1 };
  const view = renderHook(
    ({ engine, value, origin }) => usePresentedHistory(engine, value, origin),
    { initialProps: { engine, value: initial, origin } },
  );
  view.rerender({ engine, value: restored, origin });
  act(() => publisher.present(publisher.request(origin, true)));
  clock.paint();
  clock.paint();
  clock.paint();
  expect(postTask).toHaveBeenCalledWith(expect.any(Function), {
    priority: "background",
    signal: expect.any(AbortSignal),
  });
  view.rerender({ engine, value: replacement, origin: { projectId: "other", revision: 1 } });
  expect(tasks[0]!.signal.aborted).toBe(true);
  act(() => tasks[0]!.run());
  expect(view.result.current).toBe(initial);
  const freshEngine = new EditorEngine();
  view.rerender({ engine: freshEngine, value: replacement, origin });
  expect(view.result.current).toBe(replacement);
  view.rerender({ engine, value: restored, origin });
  clock.paint();
  view.unmount();
  expect(clock.frames.size).toBe(0);
  publisher.release();
});

test("a different project, pending preview and failed renderer cannot falsely acknowledge or strand history controls", () => {
  const engine = new EditorEngine();
  const presentation = getCanonicalPresentation(engine);
  const publisher = presentation.acquire();
  const origin = { projectId: engine.getSnapshot().project.id, revision: 1 };
  const initial = { label: "initial" },
    restored = { label: "restored" };
  const view = renderHook(({ value }) => usePresentedHistory(engine, value, origin), {
    initialProps: { value: initial },
  });
  view.rerender({ value: restored });
  expect(view.result.current).toBe(initial);
  act(() =>
    publisher.present(publisher.request({ projectId: "another-project", revision: 99 }, true)),
  );
  expect(view.result.current).toBe(initial);
  act(() => publisher.present(publisher.request(origin, false)));
  expect(view.result.current).toBe(initial);
  act(() => publisher.unavailable());
  expect(view.result.current).toBe(restored);
  view.unmount();
  publisher.release();
});

test("headless consumers and ordinary edits adopt immediately without a canonical publisher", () => {
  const engine = new EditorEngine();
  const initial = { label: "initial" },
    restored = { label: "restored" };
  const origin = { projectId: engine.getSnapshot().project.id, revision: 1 };
  const view = renderHook(({ value }) => usePresentedHistory(engine, value, origin), {
    initialProps: { value: initial },
  });
  view.rerender({ value: restored });
  expect(view.result.current).toBe(restored);
  view.unmount();
  const publisher = getCanonicalPresentation(engine).acquire();
  const ordinary = renderHook(({ value }) => usePresentedHistory(engine, value, null), {
    initialProps: { value: initial },
  });
  ordinary.rerender({ value: restored });
  expect(ordinary.result.current).toBe(restored);
  ordinary.unmount();
  publisher.release();
});
