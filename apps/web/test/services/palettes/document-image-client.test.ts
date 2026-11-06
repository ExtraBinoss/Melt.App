import { afterEach, expect, it, vi } from "vitest";
import type { ImageAsset } from "@musart/core";
import { PaletteImageSampler } from "../../../src/services/palettes/detection/image-client";
import type { PaletteImageResponse } from "../../../src/services/palettes/detection/image-model";

function source(id = "photo"): ImageAsset {
  return {
    id,
    name: id,
    width: 4,
    height: 4,
    mime: "image/png",
    dataUrl: "data:image/png;base64,eA==",
  };
}
class NativeWorker {
  onmessage: ((event: MessageEvent<PaletteImageResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  respond(data: PaletteImageResponse) {
    this.onmessage?.({ data } as MessageEvent<PaletteImageResponse>);
  }
}
const colors = [{ value: "#ff0000", weight: 1 }];
afterEach(() => vi.useRealTimers());

it("serializes original sampling, caches immutable assets, and ignores stale response identities", async () => {
  const worker = new NativeWorker(),
    sampler = new PaletteImageSampler(() => worker as unknown as Worker);
  const controller = new AbortController(),
    asset = source();
  const first = sampler.sample(asset, controller.signal),
    second = sampler.sample(source("second"), controller.signal);
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  worker.respond({ id: 90, colors });
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  worker.respond({ id: 1, colors });
  await expect(first).resolves.toEqual(colors);
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
  worker.respond({ id: 2, unsupported: true });
  await expect(second).resolves.toEqual([]);
  await expect(sampler.sample(asset, controller.signal)).resolves.toEqual(colors);
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
  sampler.dispose();
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it("cancels active and waiting decodes and disposes all owned worker resources", async () => {
  const workers: NativeWorker[] = [],
    sampler = new PaletteImageSampler(() => {
      const worker = new NativeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });
  const active = new AbortController(),
    waiting = new AbortController();
  const first = sampler.sample(source(), active.signal),
    second = sampler.sample(source("next"), waiting.signal);
  const firstResult = expect(first).rejects.toMatchObject({ name: "AbortError" });
  active.abort();
  await firstResult;
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  expect(workers).toHaveLength(2);
  const secondResult = expect(second).rejects.toMatchObject({ name: "AbortError" });
  sampler.dispose();
  await secondResult;
  await expect(sampler.sample(source(), waiting.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(workers[1]!.onmessage).toBeNull();
});

it("reports real decode errors and timeouts while unsupported preparation falls back", async () => {
  vi.useFakeTimers();
  const worker = new NativeWorker(),
    sampler = new PaletteImageSampler(() => worker as unknown as Worker);
  const signal = new AbortController().signal;
  const invalid = sampler.sample(source(), signal);
  const rejected = expect(invalid).rejects.toThrow("Invalid original");
  worker.respond({ id: 1, error: "Invalid original" });
  await rejected;
  const late = sampler.sample(source("late"), signal);
  const timedOut = expect(late).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(10_000);
  await timedOut;
  expect(worker.terminate).toHaveBeenCalledOnce();
  sampler.dispose();
  const unsupported = new PaletteImageSampler(() => undefined);
  await expect(unsupported.sample(source(), signal)).resolves.toEqual([]);
  unsupported.dispose();
});

it("bounds queued requests, evicts old histograms and releases queued abort listeners", async () => {
  const worker = new NativeWorker(),
    sampler = new PaletteImageSampler(() => worker as unknown as Worker);
  const controllers = Array.from({ length: 18 }, () => new AbortController());
  const requests = controllers.map((controller, index) =>
    sampler.sample(source(String(index)), controller.signal).catch((error: Error) => error),
  );
  expect(await requests[17]).toMatchObject({ message: "Palette sampling queue is full." });
  controllers[1]!.abort();
  expect(await requests[1]).toMatchObject({ name: "AbortError" });
  sampler.dispose();
  await Promise.all(requests);
  const cachedWorker = new NativeWorker(),
    cached = new PaletteImageSampler(() => cachedWorker as unknown as Worker);
  const assets = Array.from({ length: 25 }, (_, index) => source(String(index)));
  const signal = new AbortController().signal;
  for (const [index, asset] of assets.entries()) {
    const pending = cached.sample(asset, signal);
    cachedWorker.respond({ id: index + 1, colors });
    await pending;
  }
  const evicted = cached.sample(assets[0]!, signal);
  expect(cachedWorker.postMessage).toHaveBeenCalledTimes(26);
  cachedWorker.respond({ id: 26, colors });
  await evicted;
  cached.dispose();
});
