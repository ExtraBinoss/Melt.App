export interface ExtractedPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  x: number;
  y: number;
}
export interface ExtractedImage {
  blob: Blob;
  width: number;
  height: number;
  x: number;
  y: number;
}
/** Copy original RGBA through selection coverage and tightly bound the surviving pixels. */
export function extractPixels(
  source: Uint8ClampedArray,
  coverage: Uint8Array,
  width: number,
  height: number,
): ExtractedPixels | null {
  if (source.length !== width * height * 4 || coverage.length !== width * height)
    throw Error("Invalid pixel-copy dimensions.");
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (Math.round((source[index * 4 + 3]! * coverage[index]!) / 255) > 0) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  if (right < left || bottom < top) return null;
  const cropWidth = right - left + 1,
    cropHeight = bottom - top + 1;
  const data = new Uint8ClampedArray(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y++)
    for (let x = 0; x < cropWidth; x++) {
      const sourcePixel = (top + y) * width + left + x,
        target = (y * cropWidth + x) * 4;
      const alpha = Math.round((source[sourcePixel * 4 + 3]! * coverage[sourcePixel]!) / 255);
      if (!alpha) continue;
      data[target] = source[sourcePixel * 4]!;
      data[target + 1] = source[sourcePixel * 4 + 1]!;
      data[target + 2] = source[sourcePixel * 4 + 2]!;
      data[target + 3] = alpha;
    }
  return { data, width: cropWidth, height: cropHeight, x: left, y: top };
}
