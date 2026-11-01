import { expect, test, vi } from "vitest";
import { preloadEditor, scheduleStudioPreload } from "../../src/bootstrap/preload";
vi.mock("../../src/App", () => ({ App: () => null }));
vi.mock("../../src/canvas/EditorCanvas", () => ({ EditorCanvas: () => null }));
vi.mock("../../src/components/toolbar/Toolbar", () => ({ Toolbar: () => null }));
vi.mock("../../src/components/workspace/EditorSidebar", () => ({ EditorSidebar: () => null }));
vi.mock("../../src/components/motion-shell/MotionTimelineDock", () => ({
  MotionTimelineDock: () => null,
}));

test("editor intent shares one code preparation promise without mounting its components", async () => {
  const first = preloadEditor();
  expect(preloadEditor()).toBe(first);
  await first;
  expect(preloadEditor()).toBe(first);
  expect(document.querySelector(".musart-app")).toBeNull();
});

test("preloads code once in idle time, suppresses unmounted/hidden/data-saving work and observes rejection", async () => {
  let idle!: IdleRequestCallback;
  const prepare = vi.fn(async () => {}),
    cancel = vi.fn();
  const visibility = { hidden: false },
    connection = { saveData: false };
  const surface = {
    document: visibility,
    navigator: { connection },
    requestIdleCallback: vi.fn((callback: IdleRequestCallback) => {
      idle = callback;
      return 1;
    }),
    cancelIdleCallback: cancel,
  } as unknown as Window;
  const stop = scheduleStudioPreload(prepare, surface);
  expect(prepare).not.toHaveBeenCalled();
  idle({} as IdleDeadline);
  expect(prepare).toHaveBeenCalledOnce();
  stop();
  expect(cancel).toHaveBeenCalledWith(1);
  const stopped = scheduleStudioPreload(prepare, surface);
  stopped();
  idle({} as IdleDeadline);
  expect(prepare).toHaveBeenCalledOnce();
  visibility.hidden = true;
  scheduleStudioPreload(prepare, surface);
  expect(prepare).toHaveBeenCalledOnce();
  visibility.hidden = false;
  connection.saveData = true;
  const requests = vi.mocked(surface.requestIdleCallback).mock.calls.length;
  scheduleStudioPreload(prepare, surface);
  expect(surface.requestIdleCallback).toHaveBeenCalledTimes(requests);
  connection.saveData = false;
  prepare.mockRejectedValueOnce(Error("offline"));
  scheduleStudioPreload(prepare, surface);
  idle({} as IdleDeadline);
  await Promise.resolve();
});
