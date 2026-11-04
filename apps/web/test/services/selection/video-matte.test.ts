import { expect, it, vi } from "vitest";
import {
  createPersonMatte,
  halfUnit,
  halfValue,
} from "../../../src/services/selection/video/matte";
const fake = vi.hoisted(() => ({
  create: vi.fn(),
  run: vi.fn(),
  release: vi.fn(),
  tensors: [] as { dispose: ReturnType<typeof vi.fn> }[],
}));
vi.mock("../../../src/services/selection/websam/download", () => ({
  downloadModelFile: async () => new Uint8Array(2),
}));
vi.mock("../../../src/services/selection/websam/runtime", () => ({
  disposeTensors(values: Record<string, { dispose(): void }>) {
    for (const value of new Set(Object.values(values)) as Set<{ dispose(): void }>) value.dispose();
  },
  gpuRuntime: async () => ({
    executionProviders: [{ name: "webgpu", storageBufferCacheMode: "lazyRelease" }],
    ort: {
      Tensor: class {
        dispose = vi.fn();
        constructor(
          public type: string,
          public data: Float32Array | Uint16Array,
          public dims: readonly number[],
        ) {
          fake.tensors.push(this);
        }
      },
      InferenceSession: { create: fake.create },
    },
  }),
}));
it("retains recurrent states between frames, releases replaced GPU tensors and fetches only the alpha plane", async () => {
  fake.create.mockResolvedValue({ run: fake.run, release: fake.release });
  const progress = vi.fn(),
    model = await createPersonMatte(progress);
  expect(progress).toHaveBeenLastCalledWith({ file: "rvm_mobilenetv3_fp16.onnx", status: "ready" });
  const options = fake.create.mock.calls[0]![1];
  expect(options.preferredOutputLocation).toEqual({
    r1o: "gpu-buffer",
    r2o: "gpu-buffer",
    r3o: "gpu-buffer",
    r4o: "gpu-buffer",
  });
  const outputs = () =>
    Object.fromEntries(
      ["r1o", "r2o", "r3o", "r4o"].map((name) => [
        name,
        { dispose: vi.fn(), location: "gpu-buffer" },
      ]),
    );
  const first = outputs(),
    second = outputs();
  const alpha = () => ({
    type: "float16",
    dims: [1, 1, 1, 2],
    getData: async () => Uint16Array.from([halfUnit(0.5), halfUnit(1)]),
    dispose: vi.fn(),
  });
  fake.run
    .mockResolvedValueOnce({ ...first, pha: alpha() })
    .mockResolvedValueOnce({ ...second, pha: alpha() });
  const pixels = Uint8ClampedArray.from([255, 0, 128, 255, 0, 255, 0, 255]);
  expect([...(await model.frame(pixels, 2, 1))]).toEqual([128, 128, 128, 255, 255, 255, 255, 255]);
  expect(fake.run.mock.calls[0]![1]).toEqual(["pha", "r1o", "r2o", "r3o", "r4o"]);
  const source = fake.run.mock.calls[0]![0].src;
  expect([...source.data]).toEqual([halfUnit(1), 0, 0, halfUnit(1), halfUnit(128 / 255), 0]);
  expect(source.dispose).toHaveBeenCalledOnce();
  await model.frame(pixels, 2, 1);
  expect(fake.run.mock.calls[1]![0].r1i).toBe(first.r1o);
  for (const value of Object.values(first)) expect(value.dispose).toHaveBeenCalledOnce();
  for (const value of Object.values(second)) expect(value.dispose).not.toHaveBeenCalled();
  await model.dispose();
  for (const value of Object.values(second)) expect(value.dispose).toHaveBeenCalledOnce();
  expect(fake.release).toHaveBeenCalledOnce();
  for (const value of fake.tensors) expect(value.dispose).toHaveBeenCalledOnce();
});
it("normalizes source colors and preserves finite soft alpha", () => {
  for (let i = 0; i < 256; i++)
    expect(Math.abs(halfValue(halfUnit(i / 255)) - i / 255)).toBeLessThan(0.0003);
  expect(halfValue(1)).toBe(2 ** -24);
  expect(halfValue(halfUnit(0.5) | 32768)).toBe(-0.5);
  expect(() => halfValue(0x7c00)).toThrow("alpha");
  expect(() => halfValue(0x7e00)).toThrow("alpha");
});
