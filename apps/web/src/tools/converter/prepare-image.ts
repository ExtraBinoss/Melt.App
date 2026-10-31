import type { ImageAsset } from "@musart/core";
/** Native source preparation only; rendered GPU pixels never enter JavaScript. */
export async function capToolImage(
  asset: ImageAsset,
  file: File,
  signal: AbortSignal,
  read: (blob: Blob) => Promise<string>,
): Promise<ImageAsset> {
  const ratio = Math.min(1, 1920 / Math.max(asset.width, asset.height));
  if (ratio === 1) return asset;
  signal.throwIfAborted();
  const width = Math.max(1, Math.round(asset.width * ratio)),
    height = Math.max(1, Math.round(asset.height * ratio));
  const bitmap = await createImageBitmap(file, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
  });
  try {
    signal.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("bitmaprenderer");
    if (!context) throw new Error("Native image preparation is unavailable.");
    context.transferFromImageBitmap(bitmap);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("Native image preparation failed.")),
        "image/png",
      ),
    );
    signal.throwIfAborted();
    const dataUrl = await read(blob);
    signal.throwIfAborted();
    return { ...asset, width, height, mime: "image/png", dataUrl };
  } finally {
    bitmap.close();
  }
}
