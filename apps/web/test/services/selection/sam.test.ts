import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  load: vi.fn(),
  image: vi.fn(),
  encode: vi.fn(),
  decode: vi.fn(),
  tensors: [] as { dispose: ReturnType<typeof vi.fn>; data: Float32Array; dims: number[] }[],
}));
vi.mock("../../../src/services/selection/websam/runtime", () => ({
  loadSam: fake.load,
  disposeTensors: (values: Record<string, { dispose(): void }>) =>
    Object.values(values).forEach((value) => value.dispose()),
}));
vi.mock("../../../src/services/selection/websam/image", () => ({
  INPUT_SIZE: 512,
  prepareImage: fake.image,
}));
function tensor(data: number[], dims = [1, 2, 1, 2]) {
  return { type: "float32", data: new Float32Array(data), dims, dispose: vi.fn() };
}
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  fake.tensors.length = 0;
  class Tensor {
    data: Float32Array;
    dims: number[];
    dispose = vi.fn();
    constructor(_type: string, data: Float32Array, dims: number[]) {
      this.data = data;
      this.dims = dims;
      fake.tensors.push(this);
    }
  }
  fake.load.mockResolvedValue({
    ort: { Tensor },
    encoder: { run: fake.encode },
    decoder: { run: fake.decode },
  });
  fake.image.mockResolvedValue({ width: 4, height: 2, data: new Float32Array(3) });
  fake.encode.mockImplementation(async () => ({
    "image_embeddings.2": tensor([1]),
    "image_embeddings.0": tensor([1]),
    "image_embeddings.1": tensor([1]),
  }));
  fake.decode.mockImplementation(async () => ({
    pred_masks: tensor([1, -1], [1, 1, 1, 2]),
    iou_scores: tensor([0.9], [1, 1]),
  }));
});
afterEach(() => vi.unstubAllGlobals());
describe("SAM 3 worker inference", () => {
  it("feeds multiple inclusion/exclusion points and box corners to the dynamic decoder", async () => {
    const { segmentPrompt } = await import("../../../src/services/selection/sam");
    await segmentPrompt("a", {
      points: [
        { x: 1, y: 1, label: 1 },
        { x: 2, y: 1, label: 0 },
      ],
      box: { x: 0, y: 0, right: 3, bottom: 1 },
    });
    const feeds = fake.decode.mock.calls[0]![0];
    expect(feeds.input_points.dims).toEqual([1, 1, 4, 2]);
    expect(feeds.input_labels.dims).toEqual([1, 1, 4]);
    expect(Array.from(feeds.input_labels.data)).toEqual([2n, 3n, 1n, 0n]);
    expect(Array.from(feeds.input_points.data)).toEqual([0, 0, 384, 256, 128, 256, 256, 256]);
    expect(fake.tensors.every((value) => value.dispose.mock.calls.length === 1)).toBe(true);
  });
  it("shares lazy preparation, forwards progress and retries failures", async () => {
    const { prepareSam } = await import("../../../src/services/selection/sam");
    const progress = vi.fn();
    const first = prepareSam(progress);
    expect(prepareSam()).toBe(first);
    await first;
    expect(fake.load).toHaveBeenCalledOnce();
    expect(fake.load).toHaveBeenCalledWith(progress);
    vi.resetModules();
    fake.load.mockRejectedValueOnce(Error("GPU failed"));
    const retry = await import("../../../src/services/selection/sam");
    await expect(retry.prepareSam()).rejects.toThrow("GPU failed");
    await expect(retry.prepareSam()).resolves.toHaveProperty("encoder");
  });
  it("reuses one GPU embedding, maps non-square coordinates and returns only highest IoU", async () => {
    const { segmentObject } = await import("../../../src/services/selection/sam");
    const mask = await segmentObject("a", 1, 1);
    expect(mask).toMatchObject({ width: 4, height: 2 });
    expect(Array.from(mask.data.filter((_, i) => i % 4 === 3))).toEqual([
      255, 255, 0, 0, 255, 255, 0, 0,
    ]);
    const feeds = fake.decode.mock.calls[0]![0];
    expect(Array.from(feeds.input_points.data)).toEqual([128, 256, 0, 0]);
    expect(Array.from(feeds.input_labels.data)).toEqual([1n, -1n]);
    const embeddings = await fake.encode.mock.results[0]!.value;
    await segmentObject("a", 2, 1);
    expect(fake.encode).toHaveBeenCalledOnce();
    expect(embeddings["image_embeddings.2"].dispose).not.toHaveBeenCalled();
    await segmentObject("b", 1, 1);
    expect(embeddings["image_embeddings.2"].dispose).toHaveBeenCalledOnce();
    expect(fake.image).toHaveBeenCalledTimes(2);
    expect(fake.tensors.every((value) => value.dispose.mock.calls.length === 1)).toBe(true);
    const outputs = await fake.decode.mock.results[0]!.value;
    expect(outputs.pred_masks.dispose).toHaveBeenCalledOnce();
    expect(outputs.iou_scores.dispose).toHaveBeenCalledOnce();
  });
  it("cleans failed encoder/decoder work and rejects invalid points and malformed outputs", async () => {
    const { segmentObject } = await import("../../../src/services/selection/sam");
    await expect(segmentObject("a", NaN, 1)).rejects.toThrow("position");
    expect(fake.load).not.toHaveBeenCalled();
    fake.encode.mockRejectedValueOnce(Error("encoder"));
    await expect(segmentObject("a", 1, 1)).rejects.toThrow("encoder");
    expect(fake.tensors[0]!.dispose).toHaveBeenCalledOnce();
    fake.decode.mockRejectedValueOnce(Error("decoder"));
    await expect(segmentObject("a", 1, 1)).rejects.toThrow("decoder");
    await expect(segmentObject("a", 4, 1)).rejects.toThrow("outside");
    fake.decode.mockResolvedValueOnce({});
    await expect(segmentObject("a", 1, 1)).rejects.toThrow("valid masks");
    expect(fake.tensors.every((value) => value.dispose.mock.calls.length === 1)).toBe(true);
  });
  it("rejects overlapping source changes until decoder work releases its input tensors", async () => {
    const { segmentObject } = await import("../../../src/services/selection/sam");
    let begin!: () => void;
    let finish!: () => void;
    const entered = new Promise<void>((resolve) => {
      begin = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const outputs = {
      pred_masks: tensor([1, -1], [1, 1, 1, 2]),
      iou_scores: tensor([0.9], [1, 1]),
    };
    fake.decode.mockImplementationOnce(async () => {
      begin();
      await pending;
      return outputs;
    });
    const first = segmentObject("a", 1, 1);
    await entered;
    const embeddings = await fake.encode.mock.results[0]!.value;
    await expect(segmentObject("b", 1, 1)).rejects.toThrow("already running");
    await expect(segmentObject("a", 2, 1)).rejects.toThrow("already running");
    expect(fake.encode).toHaveBeenCalledOnce();
    expect(fake.decode).toHaveBeenCalledOnce();
    expect(fake.image).toHaveBeenCalledOnce();
    expect(embeddings["image_embeddings.0"].dispose).not.toHaveBeenCalled();
    expect(embeddings["image_embeddings.1"].dispose).not.toHaveBeenCalled();
    expect(embeddings["image_embeddings.2"].dispose).not.toHaveBeenCalled();
    expect(fake.tensors.slice(1).every((value) => !value.dispose.mock.calls.length)).toBe(true);
    finish();
    await first;
    expect(outputs.pred_masks.dispose).toHaveBeenCalledOnce();
    expect(outputs.iou_scores.dispose).toHaveBeenCalledOnce();
    expect(fake.tensors.every((value) => value.dispose.mock.calls.length === 1)).toBe(true);
    await segmentObject("b", 1, 1);
    expect(embeddings["image_embeddings.0"].dispose).toHaveBeenCalledOnce();
    expect(embeddings["image_embeddings.1"].dispose).toHaveBeenCalledOnce();
    expect(embeddings["image_embeddings.2"].dispose).toHaveBeenCalledOnce();
  });
});
describe("SAM 2 mask reconstruction", () => {
  it("keeps tied first scores and rejects truncated or nonfinite results", async () => {
    const { bestMask } = await import("../../../src/services/selection/sam");
    const masks = tensor([1, -1, -1, 1], [1, 2, 1, 2]);
    expect(Array.from(bestMask(masks, tensor([1, 1]), 2, 1))).toEqual([
      255, 255, 255, 255, 255, 255, 255, 0,
    ]);
    expect(() => bestMask(masks, tensor([]), 2, 1)).toThrow("scores");
    expect(() => bestMask(masks, tensor([NaN]), 2, 1)).toThrow("scores");
    expect(() => bestMask(masks, tensor([1]), 2, 1)).toThrow("valid masks");
  });
});
