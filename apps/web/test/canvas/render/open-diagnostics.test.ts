import { afterEach, expect, test, vi } from "vitest";
import { createPage } from "@musart/core";
import { CanvasOpenDiagnostics } from "../../../src/canvas/render/open-diagnostics";
import type { PreviewRequest } from "../../../src/canvas/render/frame-request";

afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers();
  const canvas = document.createElement("canvas"),
    read = vi.fn(() => ({ completed: 1, displayFrames: 0 }));
  const diagnostics = new CanvasOpenDiagnostics(canvas, read);
  const request: PreviewRequest = {
    page: createPage(),
    assets: {},
    revision: 1,
    scale: 1,
    playback: false,
  };
  return { diagnostics, request, read };
}
test("a prepared frame without a visible draw produces bounded actionable console diagnostics", () => {
  const { diagnostics, request, read } = fixture(),
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  diagnostics.start(request);
  diagnostics.prepared(1);
  vi.advanceTimersByTime(8000);
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("canvas stalled"),
    expect.objectContaining({
      pageId: request.page.id,
      revision: 1,
      phase: "awaiting-presentation",
      diagnostics: { completed: 1, displayFrames: 0 },
    }),
  );
  vi.advanceTimersByTime(60000);
  expect(warn).toHaveBeenCalledOnce();
  expect(read).toHaveBeenCalledOnce();
  diagnostics.dispose();
});
test("only the current visible frame clears the watchdog, failures retain their actual error and disposal clears timers", () => {
  const { diagnostics, request } = fixture(),
    warn = vi.spyOn(console, "warn").mockImplementation(() => {}),
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  diagnostics.start(request);
  diagnostics.start({ ...request, revision: 2 });
  diagnostics.presented(1);
  expect(vi.getTimerCount()).toBe(1);
  diagnostics.presented(2);
  vi.advanceTimersByTime(8000);
  expect(warn).not.toHaveBeenCalled();
  diagnostics.start({ ...request, revision: 3 });
  const failure = Error("GPU upload failed");
  diagnostics.failed(failure);
  expect(error).toHaveBeenCalledWith(
    "[Melt canvas failed]",
    failure,
    expect.objectContaining({ revision: 3 }),
  );
  expect(vi.getTimerCount()).toBe(0);
  diagnostics.start({ ...request, revision: 4 });
  diagnostics.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
