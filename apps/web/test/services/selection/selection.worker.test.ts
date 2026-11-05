import { ENCODER_FILE } from "../../../src/services/selection/model/manifest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  processSelection,
  handleSelection,
} from "../../../src/services/selection/selection.worker";
const sam = vi.hoisted(() => ({
  prepareSam: vi.fn(),
  releaseSam: vi.fn(),
  segmentObject: vi.fn(),
  segmentPrompt: vi.fn(),
}));
const background = vi.hoisted(() => ({
  prepareBackground: vi.fn(),
  removeBackground: vi.fn(),
  releaseBackground: vi.fn(),
}));
vi.mock("../../../src/services/selection/websam/background", () => background);
const scan = vi.hoisted(() => vi.fn());
vi.mock("../../../src/services/selection/sam", () => sam);
vi.mock("../../../src/services/selection/websam/scan", () => ({ scanObjects: scan }));
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("selection worker protocol", () => {
  it("forwards rich prompts and automatic proposals through the shared mask transport", async () => {
    const mask = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const prompt = { points: [{ x: 0, y: 0, label: 0 as const }] };
    sam.segmentPrompt.mockResolvedValue(mask);
    expect(await processSelection({ id: 30, type: "prompt", dataUrl: "source", prompt })).toEqual({
      id: 30,
      result: mask,
    });
    expect(sam.segmentPrompt).toHaveBeenCalledWith("source", prompt, undefined);
    scan.mockResolvedValue({ ...mask, candidates: [{ x: 0, y: 0, score: 0.9 }] });
    expect(await processSelection({ id: 31, type: "scan", dataUrl: "source" })).toMatchObject({
      id: 31,
      result: { candidates: [{ score: 0.9 }] },
    });
    scan.mockRejectedValueOnce(Error("scan failed"));
    expect(await processSelection({ id: 32, type: "scan", dataUrl: "source" })).toEqual({
      id: 32,
      error: "scan failed",
    });
  });
  it("encodes PNGs off the main thread, posts only the blob and releases canvas memory on success/error", async () => {
    const putImageData = vi.fn(),
      convertToBlob = vi.fn(async () => new Blob(["png"], { type: "image/png" }));
    const canvas = { width: 2, height: 1, getContext: () => ({ putImageData }), convertToBlob };
    vi.stubGlobal(
      "OffscreenCanvas",
      vi.fn(function () {
        return canvas;
      }),
    );
    vi.stubGlobal(
      "ImageData",
      vi.fn(function (data, width, height) {
        return { data, width, height };
      }),
    );
    const post = vi.fn();
    vi.stubGlobal("postMessage", post);
    const mask = { data: new Uint8ClampedArray(8), width: 2, height: 1 };
    sam.segmentObject.mockResolvedValue(mask);
    const request = {
      id: 8,
      type: "segment",
      dataUrl: "source",
      x: 0,
      y: 0,
      encode: true,
    } as const;
    await handleSelection({ data: request } as MessageEvent);
    expect(putImageData).toHaveBeenCalledWith({ data: mask.data, width: 2, height: 1 }, 0, 0);
    expect(post).toHaveBeenLastCalledWith(
      { id: 8, result: { blob: expect.any(Blob), width: 2, height: 1 } },
      [],
    );
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
    convertToBlob.mockRejectedValueOnce(Error("encode failed"));
    expect(await processSelection(request)).toEqual({ id: 8, error: "encode failed" });
    expect(canvas.width).toBe(1);
  });
  it("posts bounded progress separately from the final model response", async () => {
    const post = vi.fn();
    vi.stubGlobal("postMessage", post);
    sam.prepareSam.mockImplementationOnce(async (progress) => {
      progress({ file: ENCODER_FILE, status: "progress", loaded: 100 });
      progress({ file: ENCODER_FILE, status: "done" });
    });
    await handleSelection({ data: { id: 21, type: "prepare" } } as MessageEvent);
    expect(post).toHaveBeenCalledWith({
      id: 21,
      progress: expect.objectContaining({ loaded: 100 }),
    });
    expect(post).toHaveBeenLastCalledWith({ id: 21, result: null }, []);
  });
  it("returns connected wand masks and posts transferable result buffers", async () => {
    const request = {
      id: 3,
      type: "wand",
      pixels: new Uint8ClampedArray([20, 20, 20, 128]),
      width: 1,
      height: 1,
      x: 0,
      y: 0,
      tolerance: 0,
    } as const;
    expect(await processSelection(request)).toEqual({
      id: 3,
      result: { data: new Uint8ClampedArray([255, 255, 255, 128]), width: 1, height: 1 },
    });
    const postMessage = vi.fn();
    vi.stubGlobal("postMessage", postMessage);
    await handleSelection({ data: request } as MessageEvent<typeof request>);
    const response = postMessage.mock.calls[0]![0];
    expect(response.id).toBe(3);
    expect(postMessage.mock.calls[0]![1]).toEqual([response.result.data.buffer]);
  });
  it("prepares the model lazily and forwards model point selections", async () => {
    sam.prepareSam.mockResolvedValue({});
    sam.segmentObject.mockResolvedValue({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
    expect(await processSelection({ id: 1, type: "prepare" })).toEqual({ id: 1, result: null });
    expect(sam.prepareSam).toHaveBeenCalled();
    expect(
      await processSelection({ id: 2, type: "segment", dataUrl: "source", x: 5, y: 6 }),
    ).toMatchObject({ id: 2, result: { width: 1, height: 1 } });
    expect(sam.segmentObject).toHaveBeenCalledWith("source", 5, 6);
    const postMessage = vi.fn();
    vi.stubGlobal("postMessage", postMessage);
    await handleSelection({ data: { id: 7, type: "prepare" } } as MessageEvent);
    expect(postMessage).toHaveBeenCalledWith({ id: 7, result: null }, []);
  });
  it("returns explicit errors without hanging the caller on thrown Error or non-Error values", async () => {
    expect(
      await processSelection({
        id: 1,
        type: "wand",
        pixels: new Uint8ClampedArray(1),
        width: 1,
        height: 1,
        x: 0,
        y: 0,
        tolerance: 0,
      }),
    ).toMatchObject({ id: 1, error: expect.stringContaining("invalides") });
    sam.prepareSam.mockRejectedValueOnce("download stopped");
    expect(await processSelection({ id: 2, type: "prepare" })).toEqual({
      id: 2,
      error: "download stopped",
    });
    const postMessage = vi.fn();
    vi.stubGlobal("postMessage", postMessage);
    sam.prepareSam.mockRejectedValueOnce(new Error("download failed"));
    await handleSelection({ data: { id: 3, type: "prepare" } } as MessageEvent);
    expect(postMessage).toHaveBeenCalledWith({ id: 3, error: "download failed" }, []);
  });
});

it("routes automatic matting separately and releases the previous GPU algorithm", async () => {
  const mask = { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 128]) };
  background.removeBackground.mockResolvedValueOnce(mask);
  expect(await processSelection({ id: 70, type: "background", dataUrl: "original" })).toEqual({
    id: 70,
    result: mask,
  });
  expect(sam.releaseSam).toHaveBeenCalled();
  expect(background.removeBackground).toHaveBeenCalledWith("original", undefined);
  expect(await processSelection({ id: 71, type: "prepare", background: true })).toEqual({
    id: 71,
    result: null,
  });
  expect(background.prepareBackground).toHaveBeenCalled();
});

it("encodes a luminance matte in the model worker without sending raw pixels to the UI", async () => {
  const putImageData = vi.fn(),
    blob = new Blob(["png"], { type: "image/png" });
  const canvas = {
    width: 1,
    height: 1,
    getContext: () => ({ putImageData }),
    convertToBlob: async () => blob,
  };
  vi.stubGlobal(
    "OffscreenCanvas",
    vi.fn(function () {
      return canvas;
    }),
  );
  vi.stubGlobal(
    "ImageData",
    vi.fn(function (data, width, height) {
      return { data, width, height };
    }),
  );
  const data = new Uint8ClampedArray([255, 255, 255, 128]);
  background.removeBackground.mockResolvedValueOnce({
    data,
    width: 1,
    height: 1,
    seed: { x: 0, y: 0, label: 1 },
  });
  const result = await processSelection({
    id: 72,
    type: "background",
    dataUrl: "source",
    encode: true,
  });
  expect(result).toEqual({
    id: 72,
    result: { blob, width: 1, height: 1, seed: { x: 0, y: 0, label: 1 } },
  });
  expect(Array.from(putImageData.mock.calls[0]![0].data)).toEqual([128, 128, 128, 255]);
  expect(canvas.width).toBe(1);
});
