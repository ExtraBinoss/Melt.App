import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { usePreviewAdmission } from "../../../src/components/export/use-preview-admission";
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  const finished = { promise, resolve };
  const element = document.createElement("div");
  element.dataset.state = "open";
  document.body.append(element);
  element.getAnimations = () => [
    { playState: "running", finished: finished.promise } as unknown as Animation,
  ];
  const surface = { current: element };
  const view = renderHook(() => usePreviewAdmission(surface));
  return { ...view, element, finished, cancel, paint: () => act(() => frame!(performance.now())) };
}
test("admits preparation after the first paint and the actual entrance completes", async () => {
  const d = fixture();
  expect(d.result.current).toBe(false);
  d.paint();
  expect(d.result.current).toBe(false);
  await act(async () => {
    d.finished.resolve();
    await d.finished.promise;
  });
  expect(d.result.current).toBe(true);
  d.unmount();
  d.element.remove();
});
test.each(["closed", "unmounted"])("rejects admission after the owner is %s", async (state) => {
  const d = fixture();
  d.paint();
  if (state === "closed") d.element.dataset.state = "closed";
  else d.unmount();
  await act(async () => {
    d.finished.resolve();
    await d.finished.promise;
  });
  expect(d.result.current).toBe(false);
  d.unmount();
  expect(d.cancel).toHaveBeenCalledWith(1);
  d.element.remove();
});
