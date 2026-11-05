import type { EncodedMaskResult, MaskResult } from "./selection";

/** Native image preparation in the selection worker; no composition/GPU readback. */
export async function encodeMask(mask: MaskResult, luminance = false): Promise<EncodedMaskResult> {
  const { width, height, data } = mask;
  if (luminance)
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]!;
      data[i] = data[i + 1] = data[i + 2] = alpha;
      data[i + 3] = 255;
    }
  const canvas = new OffscreenCanvas(width, height);
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The selection mask could not be encoded.");
    context.putImageData(
      new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height),
      0,
      0,
    );
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { blob, width, height, ...(mask.seed ? { seed: mask.seed } : {}) };
  } finally {
    canvas.width = canvas.height = 1;
  }
}
