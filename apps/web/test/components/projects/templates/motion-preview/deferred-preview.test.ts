import { expect, test, vi } from "vitest";
import { startDeferredPreview } from "../../../../../src/components/projects/templates/motion-preview/deferred-preview";
import { createPreviewPlayback } from "../../../../../src/components/projects/templates/motion-preview/playback";

test("leaving during module loading aborts before the native preview is created", async () => {
  let finish!: () => void;
  const imported = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const native = vi.fn(() => ({ release: vi.fn(async () => {}) })),
    status = vi.fn();
  const owner = startDeferredPreview(async (signal) => {
    await imported;
    signal.throwIfAborted();
    return native();
  }, status);
  expect(status).toHaveBeenLastCalledWith("loading");
  const closed = owner.release();
  finish();
  await closed;
  expect(native).not.toHaveBeenCalled();
  expect(status).toHaveBeenCalledOnce();
});

test("the deferred owner forwards accepted playback/controls and removes both subscriptions on release", async () => {
  const source = createPreviewPlayback(),
    release = vi.fn(async () => {}),
    seek = vi.fn(),
    pause = vi.fn();
  const owner = startDeferredPreview(
    async () => ({ release, playback: source, seek, setPaused: pause }),
    vi.fn(),
  );
  await Promise.resolve();
  source.update({ duration: 10, ready: true, playing: true });
  source.position.set([3]);
  expect(owner.playback!.read()).toEqual({ duration: 10, ready: true, playing: true });
  expect(owner.playback!.position.read()).toEqual([3]);
  owner.seek!(5);
  owner.setPaused!(true);
  expect(seek).toHaveBeenCalledWith(5);
  expect(pause).toHaveBeenCalledWith(true);
  await owner.release();
  source.position.set([7]);
  source.update({ playing: true });
  expect(owner.playback!.position.read()).toEqual([3]);
  expect(owner.playback!.read().ready).toBe(false);
  expect(release).toHaveBeenCalledOnce();
});

test("module loading failures are reported instead of publishing a ready preview", async () => {
  const error = Error("Chunk unavailable"),
    status = vi.fn();
  const owner = startDeferredPreview(async () => {
    throw error;
  }, status);
  await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith("failed", error));
  expect(owner.playback!.read().ready).toBe(false);
  await owner.release();
});
