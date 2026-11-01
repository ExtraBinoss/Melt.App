import { afterEach, beforeEach, expect, test, vi } from "vitest";
const fake = vi.hoisted(() => ({
  create: vi.fn(),
  download: vi.fn(),
  env: { wasm: { numThreads: 8 } },
}));
vi.mock("onnxruntime-web/webgpu", () => ({
  env: fake.env,
  InferenceSession: { create: fake.create },
}));
vi.mock("../../../src/services/selection/websam/download", () => ({
  downloadModelFile: fake.download,
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("navigator", {
    gpu: { requestAdapter: vi.fn(async () => ({ features: new Set(["shader-f16"]) })) },
  });
  fake.download.mockResolvedValue(new Uint8Array(1));
});
afterEach(() => vi.unstubAllGlobals());
test("rejects unsupported WebGPU before any model download", async () => {
  vi.stubGlobal("navigator", {});
  const { loadSam } = await import("../../../src/services/selection/websam/runtime");
  await expect(loadSam()).rejects.toThrow("requires WebGPU");
  expect(fake.download).not.toHaveBeenCalled();
  expect(fake.create).not.toHaveBeenCalled();
});
test("configures deferred native buffer release and GPU-resident embeddings", async () => {
  const encoder = { release: vi.fn() },
    decoder = { release: vi.fn() };
  fake.create.mockResolvedValueOnce(encoder).mockResolvedValueOnce(decoder);
  const { loadSam } = await import("../../../src/services/selection/websam/runtime");
  const loaded = await loadSam();
  expect(loaded.encoder).toBe(encoder);
  expect(loaded.decoder).toBe(decoder);
  expect(fake.create.mock.calls[0]![1]).toEqual({
    executionProviders: [{ name: "webgpu", storageBufferCacheMode: "lazyRelease" }],
    preferredOutputLocation: "gpu-buffer",
  });
  expect(fake.create.mock.calls[1]![1]).toEqual({
    executionProviders: [{ name: "webgpu", storageBufferCacheMode: "lazyRelease" }],
  });
  expect(fake.env.wasm.numThreads).toBe(1);
});

test("waits for encoder release when decoder initialization fails", async () => {
  let begin!: () => void;
  let finish!: () => void;
  const entered = new Promise<void>((resolve) => {
    begin = resolve;
  });
  const released = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const encoder = {
    release: vi.fn(() => {
      begin();
      return released;
    }),
  };
  fake.create.mockResolvedValueOnce(encoder).mockRejectedValueOnce(Error("decoder initialization"));
  const { loadSam } = await import("../../../src/services/selection/websam/runtime");
  let settled = false;
  const pending = loadSam().finally(() => {
    settled = true;
  });
  const rejected = expect(pending).rejects.toThrow("decoder initialization");
  await entered;
  expect(encoder.release).toHaveBeenCalledOnce();
  expect(settled).toBe(false);
  finish();
  await rejected;
  expect(settled).toBe(true);
});

test("disposes aliased tensor outputs only once", async () => {
  const dispose = vi.fn();
  const { disposeTensors } = await import("../../../src/services/selection/websam/runtime");
  const value = { dispose } as unknown as Parameters<typeof disposeTensors>[0][string];
  disposeTensors({ first: value, alias: value });
  expect(dispose).toHaveBeenCalledOnce();
});

test("rejects absent shader-f16 before downloading half-precision weights", async () => {
  vi.stubGlobal("navigator", {
    gpu: { requestAdapter: vi.fn(async () => ({ features: new Set() })) },
  });
  const { loadSam } = await import("../../../src/services/selection/websam/runtime");
  await expect(loadSam()).rejects.toThrow("shader-f16");
  expect(fake.download).not.toHaveBeenCalled();
});
