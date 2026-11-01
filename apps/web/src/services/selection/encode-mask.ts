import type { EncodedMaskResult, MaskResult } from "./selection";

/** Native image preparation in the selection worker; no composition/GPU readback. */
export async function encodeMask(mask: MaskResult): Promise<EncodedMaskResult> {
  const { width, height, data } = mask;
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
    return { blob, width, height };
  } finally {
    canvas.width = canvas.height = 1;
  }
}
