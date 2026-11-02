import { afterEach, expect, test, vi } from "vitest";
import { createLayer } from "@musart/core";
import {
  imageDimension,
  imageFootprints,
  prepareAssetImage,
  prepareImage,
} from "../../src/surface/image-preparation";

afterEach(() => vi.unstubAllGlobals());

test("native preparation resizes in the browser, owns its bitmap and preserves default originals", async () => {
  const image = {} as HTMLImageElement,
    close = vi.fn();
  const resize = vi.fn().mockResolvedValue({ width: 480, height: 240, close });
  vi.stubGlobal("createImageBitmap", resize);
  expect(await prepareImage(image, 4096, 2048)).toEqual({ image, width: 4096, height: 2048 });
  const result = await prepareImage(image, 4096, 2048, 480);
  expect(resize).toHaveBeenCalledWith(image, {
    resizeWidth: 480,
    resizeHeight: 240,
    resizeQuality: "high",
    imageOrientation: "flipY",
    premultiplyAlpha: "none",
  });
  result.close?.();
  expect(close).toHaveBeenCalledOnce();
  await expect(prepareImage(image, 1, 1, 0)).rejects.toThrow("dimension");
});

test("uses the largest rendered plane across image instances, while preserving mask references", () => {
  const plain = createLayer("image", { assetId: "image", width: 320, height: 180 });
  const larger = { ...plain, id: "larger", width: 800, height: 400 };
  const footprints = imageFootprints([plain, larger], 0.5);
  expect(footprints.get("image")).toEqual({ width: 400, height: 200 });
  expect(imageDimension(4096, 2048, footprints.get("image"))).toBe(400);
  expect(imageDimension(4096, 2048, footprints.get("image"), 256)).toBe(256);
  const masked = createLayer("rectangle", {
    mask: { enabled: true, assetId: "image", inverted: false },
  });
  expect(imageFootprints([plain, masked, larger], 1).get("image")).toBeNull();
  expect(imageDimension(4096, 2048, null)).toBeUndefined();
  expect(imageFootprints([plain])).toEqual(new Map());
});
test("keeps authored image pixels for both clipped layers and their visible silhouette bases", () => {
  const base = createLayer("image", { id: "base", assetId: "base-image", width: 80, height: 60 }),
    top = createLayer("image", { assetId: "top-image", clipping: { layerId: base.id } });
  const footprints = imageFootprints([base, top], 0.25);
  expect(footprints.get("base-image")).toBeNull();
  expect(footprints.get("top-image")).toBeNull();
});

test("cancellation closes the original and resized native bitmaps before they enter the cache", async () => {
  const controller = new AbortController(),
    originalClosed = vi.fn(),
    resizedClosed = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("encoded original")),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (_source, options: ImageBitmapOptions) => {
      if (options.resizeWidth === undefined)
        return { width: 4096, height: 2048, close: originalClosed };
      controller.abort();
      return { width: 480, height: 240, close: resizedClosed };
    }),
  );
  await expect(
    prepareAssetImage(
      {
        id: "original",
        name: "original",
        mime: "image/png",
        width: 4096,
        height: 2048,
        dataUrl: "image:data",
      },
      undefined,
      480,
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(originalClosed).toHaveBeenCalledOnce();
  expect(resizedClosed).toHaveBeenCalledOnce();
});
