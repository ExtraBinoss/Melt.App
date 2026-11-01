import { expect, it, vi } from "vitest";
import type { WebGPURenderer } from "three/webgpu";
import { PlaybackSubmissions } from "../../src/cache/playback-submissions";
it("pipelines a bounded window, admits only after native completion, and drains teardown", async () => {
  const done: (() => void)[] = [],
    queue = {
      onSubmittedWorkDone: vi.fn(() => new Promise<void>((resolve) => done.push(resolve))),
    },
    gate = new PlaybackSubmissions({ backend: { device: { queue } } } as unknown as WebGPURenderer);
  for (let i = 0; i < 8; i++) {
    await gate.admit();
    gate.submitted();
  }
  expect(gate.stats()).toEqual({ pending: 8, peak: 8, limit: 8 });
  expect(() => gate.submitted()).toThrow("exceeded");
  const controller = new AbortController(),
    cancelled = gate.admit(controller.signal);
  controller.abort();
  await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  let admitted = false;
  const waiting = gate.admit().then(() => {
    admitted = true;
  });
  await Promise.resolve();
  expect(admitted).toBe(false);
  done[0]!();
  await waiting;
  expect(admitted).toBe(true);
  let disposed = false;
  const closing = gate.dispose().then(() => {
    disposed = true;
  });
  await Promise.resolve();
  expect(disposed).toBe(false);
  for (const finish of done) finish();
  await closing;
  expect(gate.stats().pending).toBe(0);
  await expect(gate.admit()).rejects.toThrow("closed");
});
it("surfaces native errors while preserving cleanup", async () => {
  const queue = {
      onSubmittedWorkDone: vi.fn(async () => {
        throw Error("GPU lost");
      }),
    },
    gate = new PlaybackSubmissions({ backend: { device: { queue } } } as unknown as WebGPURenderer);
  gate.submitted();
  await Promise.resolve();
  await Promise.resolve();
  await expect(gate.admit()).rejects.toThrow("GPU lost");
  await expect(gate.dispose()).rejects.toThrow("GPU lost");
});
