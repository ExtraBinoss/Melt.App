import { MAX_ALPHA_PIXELS, type AlphaRequest, type AlphaResponse } from "./alpha-model";

self.onmessage = async ({ data }: MessageEvent<AlphaRequest>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    if (data.width * data.height > MAX_ALPHA_PIXELS) throw Error("Source exceeds picking limit");
    const blob = await (await fetch(data.source)).blob();
    bitmap = await createImageBitmap(blob);
    if (bitmap.width * bitmap.height > MAX_ALPHA_PIXELS)
      throw Error("Source exceeds picking limit");
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw Error("Native source preparation is unavailable");
    context.drawImage(bitmap, 0, 0);
    // Native immutable source preparation, never a compositor/GPU readback.
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const alpha = new Uint8Array(bitmap.width * bitmap.height);
    for (let at = 0; at < alpha.length; at++) alpha[at] = pixels[at * 4 + 3]!;
    const response: AlphaResponse = {
      id: data.id,
      width: bitmap.width,
      height: bitmap.height,
      alpha,
    };
    self.postMessage(response, { transfer: [alpha.buffer] });
    canvas.width = canvas.height = 1;
  } catch (error) {
    self.postMessage({
      id: data.id,
      width: 0,
      height: 0,
      error: String(error),
    } satisfies AlphaResponse);
  } finally {
    bitmap?.close();
  }
};
