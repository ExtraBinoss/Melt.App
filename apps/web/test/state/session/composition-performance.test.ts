import { createPage, createProject, EditorEngine } from "@musart/core";
import { expect, test, vi } from "vitest";
import {
  getCompositionPerformance,
  type CompositionPerformanceSnapshot,
} from "../../../src/state/session/composition-performance";
import { deferred, performanceSnapshot } from "../../canvas/performance/fixtures";

function fixture(count = 1) {
  const pages = Array.from({ length: count }, (_, i) => createPage({ id: `page-${i}` }));
  const engine = new EditorEngine(createProject({ pages }));
  const port = getCompositionPerformance(engine);
  return { engine, port, id: pages[0]!.id };
}

test("requires an actual profiler, publishes immutable values and invalidates edited scene data", async () => {
  const { engine, port, id } = fixture();
  const signal = new AbortController().signal;
  expect(getCompositionPerformance(engine)).toBe(port);
  expect(port.read(id)).toBeNull();
  await expect(port.request(id, signal)).rejects.toMatchObject({ code: "unavailable" });
  const notify = vi.fn(),
    stop = port.subscribe(notify);
  const source = performanceSnapshot(id);
  const release = port.registerProfiler(async () => source);
  const value = await port.request(id, signal);
  expect(value).toEqual(source);
  expect(value).not.toBe(source);
  expect(Object.isFrozen(value.metrics[0])).toBe(true);
  expect(port.read(id)).toBe(value);
  expect(value.gpu).toEqual({
    value: null,
    availability: "unavailable",
    reason: "timestamp-query",
  });
  engine.execute({ type: "renameProject", name: "Changed" });
  expect(port.read(id)).toBeNull();
  const calls = notify.mock.calls.length;
  stop();
  release();
  expect(notify).toHaveBeenCalledTimes(calls);
});

test("caller cancellation settles even a profiler ignoring abort and rejects its late snapshot", async () => {
  const { port, id } = fixture();
  const waiting = deferred<CompositionPerformanceSnapshot>();
  let providerSignal: AbortSignal | undefined;
  port.registerProfiler((_id, signal) => {
    providerSignal = signal;
    return waiting.promise;
  });
  const caller = new AbortController();
  const result = port.request(id, caller.signal);
  const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
  caller.abort();
  await rejection;
  expect(providerSignal?.aborted).toBe(true);
  waiting.resolve(performanceSnapshot(id));
  await Promise.resolve();
  expect(port.read(id)).toBeNull();
});

test("superseding requests and document changes cancel profiling without resurrecting results", async () => {
  const { engine, port, id } = fixture();
  const waiting = deferred<CompositionPerformanceSnapshot>();
  const provider = vi
    .fn()
    .mockReturnValueOnce(waiting.promise)
    .mockResolvedValueOnce(performanceSnapshot(id));
  port.registerProfiler(provider);
  const first = port.request(id, new AbortController().signal);
  const aborted = expect(first).rejects.toMatchObject({ name: "AbortError" });
  const latest = await port.request(id, new AbortController().signal);
  await aborted;
  waiting.resolve({ ...performanceSnapshot(id), sampleCount: 100 });
  await Promise.resolve();
  expect(port.read(id)).toBe(latest);
  const changing = deferred<CompositionPerformanceSnapshot>();
  port.registerProfiler(() => changing.promise);
  const pending = port.request(id, new AbortController().signal);
  const stale = expect(pending).rejects.toMatchObject({ code: "stale" });
  engine.execute({ type: "renameProject", name: "Changed" });
  await stale;
  changing.resolve(performanceSnapshot(id));
  await Promise.resolve();
  expect(port.read(id)).toBeNull();
});

test("provider leases cannot unregister a replacement and releasing the active provider cancels work", async () => {
  const { port, id } = fixture();
  const old = port.registerProfiler(async () => performanceSnapshot(id));
  const pending = deferred<CompositionPerformanceSnapshot>();
  const release = port.registerProfiler(() => pending.promise);
  old();
  const result = port.request(id, new AbortController().signal);
  const rejected = expect(result).rejects.toMatchObject({ code: "unavailable" });
  release();
  await rejected;
  pending.resolve(performanceSnapshot(id));
  expect(port.read(id)).toBeNull();
});

test("rejects invalid timings and composition IDs instead of publishing plausible-looking values", async () => {
  const { port, id } = fixture();
  for (const snapshot of [
    { ...performanceSnapshot(id), compositionId: "other" },
    { ...performanceSnapshot(id), cpu: { value: Number.NaN, availability: "measured" as const } },
    { ...performanceSnapshot(id), gpu: { value: 4, availability: "unavailable" as const } },
    { ...performanceSnapshot(id), measuredAt: Number.MAX_VALUE },
    {
      ...performanceSnapshot(id),
      metrics: [...performanceSnapshot(id).metrics, ...performanceSnapshot(id).metrics],
    },
  ]) {
    port.registerProfiler(async () => snapshot);
    await expect(port.request(id, new AbortController().signal)).rejects.toMatchObject({
      code: "invalid",
    });
    expect(port.read(id)).toBeNull();
  }
  await expect(port.request("deleted", new AbortController().signal)).rejects.toMatchObject({
    code: "stale",
  });
});

test("bounds retained snapshots to the most recent 32 compositions", async () => {
  const { port } = fixture(35);
  port.registerProfiler(async (id) => performanceSnapshot(id));
  for (let i = 0; i < 35; i++) await port.request(`page-${i}`, new AbortController().signal);
  expect(port.read("page-0")).toBeNull();
  expect(port.read("page-2")).toBeNull();
  expect(port.read("page-3")).not.toBeNull();
  expect(port.read("page-34")).not.toBeNull();
});

test("bounds request lifetime and cancels the provider's resources on timeout", async () => {
  vi.useFakeTimers();
  try {
    const { port, id } = fixture();
    const waiting = deferred<CompositionPerformanceSnapshot>();
    let signal: AbortSignal | undefined;
    port.registerProfiler((_id, next) => {
      signal = next;
      return waiting.promise;
    });
    const result = port.request(id, new AbortController().signal);
    const rejected = expect(result).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(8_000);
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    waiting.resolve(performanceSnapshot(id));
    expect(port.read(id)).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("same-id project replacement invalidates cached and pending measurements", async () => {
  const { engine, port, id } = fixture();
  const original = engine.getSnapshot().project;
  const stop = port.registerProfiler(async () => performanceSnapshot(id));
  await port.request(id, new AbortController().signal);
  engine.load(original);
  expect(port.read(id)).toBeNull();
  const pending = deferred<CompositionPerformanceSnapshot>();
  stop();
  const release = port.registerProfiler(() => pending.promise);
  const request = port.request(id, new AbortController().signal);
  engine.load(original);
  await expect(request).rejects.toMatchObject({ code: "stale" });
  pending.resolve(performanceSnapshot(id));
  expect(port.read(id)).toBeNull();
  release();
});
