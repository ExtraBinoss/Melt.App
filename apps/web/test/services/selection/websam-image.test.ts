import { afterEach, expect, test, vi } from "vitest";
import { INPUT_SIZE, prepareImage } from "../../../src/services/selection/websam/image";

afterEach(() => vi.unstubAllGlobals());

function source() {
  const image = { width: 614, height: 410, close: vi.fn() };
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([255, 0, 128, 255]) })),
  };
  const canvas = { width: 1, height: 1, getContext: vi.fn(() => context) };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Blob(["source"]))),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => image),
  );
  vi.stubGlobal("OffscreenCanvas", function () {
    return canvas;
  });
  return { image, context, canvas };
}

test("uses the pinned SAM 2.1 square/ImageNet contract while preserving original aspect metadata", async () => {
  const d = source();
  expect(INPUT_SIZE).toBe(1024);
  const result = await prepareImage("source", 1);
  expect(result.width).toBe(614);
  expect(result.height).toBe(410);
  expect(result.data[0]).toBeCloseTo((1 - 0.485) / 0.229);
  expect(result.data[1]).toBeCloseTo(-0.456 / 0.224);
  expect(result.data[2]).toBeCloseTo((128 / 255 - 0.406) / 0.225);
  expect(d.context.drawImage).toHaveBeenCalledWith(d.image, 0, 0, 1, 1);
  expect(d.image.close).toHaveBeenCalledOnce();
});

test("preserves explicit normalization for other image models and closes failed source preparation", async () => {
  const d = source();
  const result = await prepareImage("source", 1, [0, 0, 0], [1, 1, 1]);
  expect(Array.from(result.data)).toEqual([1, 0, Math.fround(128 / 255)]);
  d.image.width = 0;
  await expect(prepareImage("source", 1)).rejects.toThrow("dimensions");
  expect(d.image.close).toHaveBeenCalledTimes(2);
});
