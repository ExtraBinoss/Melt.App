import { expect, it, vi } from "vitest";
import { EditorEngine } from "@musart/core";
import { createRendererErrorReporter } from "../../../src/canvas/render/error-reporting";
import { ERROR_NOTICE_MS } from "../../../src/components/notifications/EditorNotice";
import { subscribeEditorNotices } from "../../../src/components/notifications/source";

it("uses the engine's standard notice channel when a renderer has no callback", () => {
  const engine = new EditorEngine(),
    notice = vi.fn(),
    otherNotice = vi.fn(),
    stop = subscribeEditorNotices(engine, notice),
    stopOther = subscribeEditorNotices(new EditorEngine(), otherNotice),
    report = createRendererErrorReporter(engine, () => undefined);
  report("GPU texture 8439×2265 exceeds device limit 8192");
  expect(notice).toHaveBeenCalledExactlyOnceWith({
    message: "GPU texture 8439×2265 exceeds device limit 8192",
    details: "GPU texture 8439×2265 exceeds device limit 8192",
    error: true,
  });
  expect(otherNotice).not.toHaveBeenCalled();
  stop();
  stopOther();
});

it("bounds duplicate display feedback while preserving new failures and later occurrences", () => {
  let time = 0;
  const callback = vi.fn(),
    replacement = vi.fn();
  let current = callback;
  const report = createRendererErrorReporter(
    undefined,
    () => current,
    () => time,
  );
  const details = "RangeError: GPU texture 8439×2265 exceeds device limit 8192";
  report("GPU rendering failed", details);
  time = ERROR_NOTICE_MS - 1;
  report("GPU rendering failed", details);
  expect(callback).toHaveBeenCalledExactlyOnceWith("GPU rendering failed", details);
  current = replacement;
  time = ERROR_NOTICE_MS;
  report("GPU rendering failed", details);
  report("Device lost", "Error: Device lost");
  expect(replacement.mock.calls).toEqual([
    ["GPU rendering failed", details],
    ["Device lost", "Error: Device lost"],
  ]);
});
