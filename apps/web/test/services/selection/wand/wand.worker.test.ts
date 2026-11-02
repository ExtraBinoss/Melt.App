import { expect, it, vi } from "vitest";
it("encodes copied source RGBA in the worker and reports real encoding failures", async () => {
  const previous = globalThis.onmessage;
  const put = vi.fn(),
    blob = new Blob(["encoded"], { type: "image/png" }),
    encode = vi.fn(async () => blob);
  const canvas = {
    width: 2,
    height: 1,
    getContext: () => ({ putImageData: put }),
    convertToBlob: encode,
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
  try {
    const { processWand } = await import("../../../../src/services/selection/wand/wand.worker");
    await processWand({
      id: 30,
      type: "source",
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 40, 50, 60, 255]),
    });
    await processWand({
      id: 31,
      type: "preview",
      x: 1,
      y: 0,
      tolerance: 0,
      mode: "new",
      contiguous: true,
    });
    await processWand({ id: 32, type: "accept" });
    expect(await processWand({ id: 33, type: "extract" })).toEqual({
      id: 33,
      image: { blob, width: 2, height: 1, x: 1, y: 0 },
    });
    expect(put.mock.calls[0]![0].data).toEqual(
      new Uint8ClampedArray([40, 50, 60, 255, 40, 50, 60, 255]),
    );
    expect(canvas.width).toBe(1);
    encode.mockRejectedValueOnce(Error("PNG encoding failed"));
    expect(await processWand({ id: 34, type: "extract" })).toEqual({
      id: 34,
      error: "PNG encoding failed",
    });
  } finally {
    globalThis.onmessage = previous;
    vi.unstubAllGlobals();
  }
});
it("returns bounded previews and transfers only an explicitly exported mask", async () => {
  const post = vi.fn(),
    previous = globalThis.onmessage;
  vi.stubGlobal("postMessage", post);
  try {
    vi.resetModules();
    await import("../../../../src/services/selection/wand/wand.worker");
    const send = (data: unknown) =>
      globalThis.onmessage!.call(window, new MessageEvent("message", { data }));
    send({
      id: 1,
      type: "source",
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([10, 10, 10, 255]),
    });
    expect(post.mock.calls.at(-1)![1]).toEqual([]);
    send({ id: 2, type: "preview", x: 0, y: 0, tolerance: 0, mode: "new", contiguous: true });
    send({ id: 3, type: "accept" });
    send({ id: 4, type: "export" });
    const [response, transfer] = post.mock.calls.at(-1)!;
    expect(response.mask.data).toEqual(new Uint8ClampedArray([255, 255, 255, 255]));
    expect(transfer).toEqual([response.mask.data.buffer]);
  } finally {
    globalThis.onmessage = previous;
    vi.unstubAllGlobals();
  }
});
