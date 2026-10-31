import { expect, test, vi } from "vitest";
import { Scene, OrthographicCamera, RenderTarget, type WebGPURenderer } from "three/webgpu";
import type { GpuStats } from "@musart/render";
import { SceneProfileSource } from "../../../src/canvas/render/scene-profile-source";
function fixture(supported: boolean) {
  const durations = new Map<string, number>();
  const native = {
    inspector: { beginRender: vi.fn<WebGPURenderer["inspector"]["beginRender"]>() },
    backend: {
      trackTimestamp: false,
      get: () => ({}),
      hasTimestampQuery: (uid: string) => durations.has(uid),
      getTimestamp: (uid: string) => durations.get(uid)!,
    },
    getCanvasTarget: () => ({}),
    info: { autoReset: true, reset: vi.fn(), render: { drawCalls: 4, timestamp: 99 } },
    hasFeature: () => supported,
    resolveTimestampsAsync: vi.fn<() => Promise<number | undefined>>(),
  };
  let stats: GpuStats = {
    passes: 2,
    frames: 1,
    uploads: 0,
    targets: 1,
    readbacks: 0,
    cacheBytes: 10,
    maxBytes: 100,
    cacheHits: 0,
    vectorParses: 0,
    profile: { pipeline: [7], sources: [8], text: [9], compose: [10] },
  };
  const source = new SceneProfileSource(native as unknown as WebGPURenderer, () => stats);
  return {
    native,
    source,
    render(uid: string, stage: string, ms: number) {
      const scene = Object.assign(new Scene(), { name: `melt:${stage}` });
      native.inspector.beginRender(uid, scene, new OrthographicCamera(), new RenderTarget(1, 1));
      durations.set(uid, ms);
    },
    replace(next: Partial<GpuStats>) {
      stats = { ...stats, ...next };
    },
  };
}
test("profiling is dormant, distinguishes cached work and restores renderer state", () => {
  const d = fixture(false),
    receive = vi.fn();
  d.source.begin(1);
  d.source.presented("page", 1);
  expect(d.native.info.reset).not.toHaveBeenCalled();
  const close = d.source.open(receive);
  d.source.begin(2);
  d.source.prepared(2);
  d.source.presented("page", 2);
  expect(receive.mock.calls[0]![0]).toMatchObject({
    gpuMs: null,
    drawCommands: 4,
    passes: 0,
    phases: { sources: 0 },
  });
  d.source.begin(3);
  d.replace({ passes: 5, frames: 2 });
  d.source.prepared(3);
  d.source.presented("page", 3);
  expect(receive.mock.calls[1]![0]).toMatchObject({ passes: 3, phases: { sources: 8 } });
  close();
  expect(d.native.backend.trackTimestamp).toBe(false);
  expect(d.native.info.autoReset).toBe(true);
});
test("only resolved timestamps qualify as GPU measurements and canceled sessions ignore late query results", async () => {
  const d = fixture(true),
    receive = vi.fn();
  let resolve!: (time: number | undefined) => void;
  d.native.resolveTimestampsAsync.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const close = d.source.open(receive);
  d.source.begin(1);
  d.source.prepared(1);
  d.source.presented("page", 1);
  expect(receive).not.toHaveBeenCalled();
  resolve(undefined);
  await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
  expect(receive.mock.calls[0]![0].gpuMs).toBeNull();
  d.source.begin(2);
  d.source.prepared(2);
  d.source.presented("page", 2);
  close();
  resolve(2.5);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(receive).toHaveBeenCalledOnce();
  expect(d.native.backend.trackTimestamp).toBe(false);
});

test("sums every captured GPU pass instead of the last Three frame, preserving the inspector", async () => {
  const d = fixture(true),
    receive = vi.fn(),
    original = d.native.inspector.beginRender;
  d.native.resolveTimestampsAsync.mockResolvedValue(99);
  const close = d.source.open(receive);
  d.source.begin(1);
  d.render("r:1", "video", 2);
  d.render("r:2", "mask", 3);
  d.render("r:3", "mask", 4);
  d.source.prepared(1);
  d.source.presented("page", 1);
  await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
  expect(receive.mock.calls[0]![0]).toMatchObject({ gpuMs: 9, gpuPasses: { video: 2, mask: 7 } });
  expect(original).toHaveBeenCalledTimes(3);
  close();
  expect(d.native.inspector.beginRender).toBe(original);
});

test("missing or invalid pass timestamps invalidate the total rather than fabricating zero", async () => {
  const d = fixture(true),
    receive = vi.fn();
  d.native.resolveTimestampsAsync.mockResolvedValue(99);
  d.source.open(receive);
  d.source.begin(1);
  d.render("r:bad", "mask", NaN);
  d.source.presented("page", 1);
  await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
  expect(receive.mock.calls[0]![0]).toMatchObject({ gpuMs: null, gpuPasses: null });
  d.source.dispose();
});
