import { sampleSourceColors } from "./colors";
import {
  MAX_PALETTE_SOURCE_LENGTH,
  MAX_PALETTE_SOURCE_PIXELS,
  PALETTE_SAMPLE_SIDE,
} from "./image-model";
import type { PaletteImageRequest, PaletteImageResponse } from "./image-model";

self.onmessage = async ({ data }: MessageEvent<PaletteImageRequest>) => {
  let bitmap: ImageBitmap | undefined, canvas: OffscreenCanvas | undefined;
  const send = (response: Omit<PaletteImageResponse, "id">) =>
    self.postMessage({ id: data.id, ...response });
  try {
    if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
      send({ unsupported: true });
      return;
    }
    if (!data.source.startsWith("data:image/"))
      throw Error("Palette sampling requires an embedded image original.");
    // Bound original decode memory and string cloning independently of the sample size.
    if (
      data.width * data.height > MAX_PALETTE_SOURCE_PIXELS ||
      data.source.length > MAX_PALETTE_SOURCE_LENGTH
    ) {
      send({ unsupported: true });
      return;
    }
    const scale = Math.min(1, PALETTE_SAMPLE_SIDE / Math.max(data.width, data.height));
    const width = Math.max(1, Math.round(data.width * scale));
    const height = Math.max(1, Math.round(data.height * scale));
    const response = await fetch(data.source);
    if (!response.ok) throw Error("The image original could not be read.");
    bitmap = await createImageBitmap(await response.blob(), {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: "low",
    });
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      send({ unsupported: true });
      return;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    // Native immutable original preparation only. The editor's GPU surface is never read.
    send({ colors: sampleSourceColors(context.getImageData(0, 0, width, height).data) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotSupportedError")
      send({ unsupported: true });
    else send({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    bitmap?.close();
    if (canvas) canvas.width = canvas.height = 1;
  }
};
