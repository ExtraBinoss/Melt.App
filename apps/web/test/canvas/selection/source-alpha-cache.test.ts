import { expect, test, vi } from "vitest";
import type { ImageAsset } from "@musart/core";
import type { AlphaResponse } from "../../../src/canvas/selection/picking/alpha-model";
import { SourceAlphaCache } from "../../../src/canvas/selection/picking/alpha-cache";
function setup() {
  const workers: {
    onmessage: ((event: MessageEvent<AlphaResponse>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
  }[] = [];
  const changed = vi.fn();
  const cache = new SourceAlphaCache(changed, () => {
    const worker = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() };
    workers.push(worker);
    return worker;
  });
  const asset = (source: string, pixels = 2): ImageAsset => ({
    id: source,
    name: source,
    mime: "image/png",
    width: pixels,
    height: 1,
    dataUrl: source,
  });
  const reply = (worker = workers[0]!, id = 1, alpha = new Uint8Array([0, 128])) =>
    worker.onmessage?.({
      data: { id, width: alpha.length, height: 1, alpha },
    } as MessageEvent<AlphaResponse>);
  return { cache, workers, changed, asset, reply };
}
test("source preparation is shared; transparent and fractional-alpha samples are synchronous cache reads", () => {
  const { cache, workers, asset, reply, changed } = setup();
  cache.update([asset("a"), asset("a")]);
  expect(workers[0]!.postMessage).toHaveBeenCalledTimes(1);
  expect(cache.hit("a", 0.1, 0)).toBe(true);
  reply();
  expect(cache.hit("a", 0.1, 0)).toBe(false);
  expect(cache.hit("a", 0.9, 0)).toBe(true);
  cache.update([asset("a")]);
  expect(workers[0]!.postMessage).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalledTimes(1);
  cache.dispose();
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
});
test("removing/replacing a source terminates pending work; late responses cannot populate the new origin", () => {
  const { cache, workers, asset, reply, changed } = setup();
  cache.update([asset("old")]);
  const stale = workers[0]!.onmessage!;
  cache.update([asset("new")]);
  stale({
    data: { id: 1, width: 2, height: 1, alpha: new Uint8Array(2) },
  } as MessageEvent<AlphaResponse>);
  expect(changed).not.toHaveBeenCalled();
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  reply(workers[1], 2);
  expect(cache.hit("new", 0, 0)).toBe(false);
  expect(cache.hit("old", 0, 0)).toBe(true);
  cache.dispose();
});
test("oversized, unsupported and failed sources retain geometry fallback without retry loops", () => {
  const { cache, workers, asset } = setup();
  cache.update([asset("huge", 16_777_217), asset("bad")]);
  expect(workers[0]!.postMessage.mock.calls[0]![0].source).toBe("bad");
  workers[0]!.onmessage?.({
    data: { id: 1, width: 0, height: 0, error: "Decode failed" },
  } as MessageEvent<AlphaResponse>);
  cache.update([asset("bad")]);
  expect(workers[0]!.postMessage).toHaveBeenCalledTimes(1);
  expect(cache.hit("bad", 0, 0)).toBe(true);
  cache.dispose();
});

test("a late error from a terminated worker cannot fail the new source", () => {
  const { cache, workers, asset, reply } = setup();
  cache.update([asset("old")]);
  const staleError = workers[0]!.onerror!;
  cache.update([asset("new")]);
  staleError({} as ErrorEvent);
  expect(workers[1]!.terminate).not.toHaveBeenCalled();
  reply(workers[1], 2);
  expect(cache.hit("new", 0, 0)).toBe(false);
  cache.dispose();
});
test("timeouts retire the decoder, continue the bounded queue, and disposal rejects late work", () => {
  vi.useFakeTimers();
  try {
    const { cache, workers, asset, reply, changed } = setup();
    cache.update([asset("stalled"), asset("next")]);
    vi.advanceTimersByTime(15000);
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(workers[1]!.postMessage.mock.calls[0]![0].source).toBe("next");
    reply(workers[1], 2);
    expect(cache.hit("next", 0, 0)).toBe(false);
    const stale = workers[1]!.onmessage!;
    cache.dispose();
    stale({
      data: { id: 2, width: 2, height: 1, alpha: new Uint8Array(2) },
    } as MessageEvent<AlphaResponse>);
    vi.runAllTimers();
    cache.update([asset("after-disposal")]);
    expect(workers).toHaveLength(2);
    expect(changed).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
test("unavailable workers and malformed replies retain fallback without repeated decoder creation", () => {
  const unavailable = vi.fn(() => {
    throw new Error("Unavailable");
  });
  const { asset, cache, workers } = setup();
  const missing = new SourceAlphaCache(vi.fn(), unavailable);
  missing.update([asset("a")]);
  missing.update([asset("a")]);
  expect(unavailable).toHaveBeenCalledOnce();
  expect(missing.hit("a", 0, 0)).toBe(true);
  missing.dispose();
  cache.update([asset("bad")]);
  workers[0]!.onmessage?.({
    data: { id: 1, width: -2, height: -1, alpha: new Uint8Array(2) },
  } as MessageEvent<AlphaResponse>);
  expect(cache.hit("bad", 0, 0)).toBe(true);
  cache.dispose();
});

test("the source queue is capped and released planes do not survive source removal", () => {
  const { cache, workers, asset, reply } = setup();
  cache.update(Array.from({ length: 65 }, (_, at) => asset(`source-${at}`)));
  for (let id = 1; id <= 64; id++) reply(workers[0], id);
  expect(workers[0]!.postMessage).toHaveBeenCalledTimes(64);
  expect(cache.hit("source-63", 0, 0)).toBe(false);
  expect(cache.hit("source-64", 0, 0)).toBe(true);
  cache.update([]);
  expect(cache.hit("source-63", 0, 0)).toBe(true);
  cache.dispose();
});
