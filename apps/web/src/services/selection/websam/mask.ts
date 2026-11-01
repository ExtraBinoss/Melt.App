interface NumericTensor {
  readonly data: ArrayLike<number | bigint>;
  readonly dims: readonly number[];
}
export function bestIndex(scores: NumericTensor): number {
  if (!scores.data.length) throw new Error("The model returned no valid mask scores.");
  let best = 0;
  for (let i = 0; i < scores.data.length; i++) {
    const value = Number(scores.data[i]);
    if (!Number.isFinite(value)) throw new Error("The model returned invalid mask scores.");
    if (value > Number(scores.data[best])) best = i;
  }
  return best;
}
/** Resize only the highest-IoU candidate, interpolating logits before thresholding. */
export function bestMask(
  masks: NumericTensor,
  scores: NumericTensor,
  width: number,
  height: number,
) {
  const best = bestIndex(scores),
    maskWidth = masks.dims.at(-1)!,
    maskHeight = masks.dims.at(-2)!,
    area = maskWidth * maskHeight;
  if (!Number.isSafeInteger(area) || area <= 0 || masks.data.length !== area * scores.data.length)
    throw new Error("The model returned no valid masks.");
  const data = new Uint8ClampedArray(width * height * 4),
    offset = best * area;
  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, Math.min(maskHeight - 1, ((y + 0.5) * maskHeight) / height - 0.5));
    const y0 = Math.floor(sy),
      y1 = Math.min(y0 + 1, maskHeight - 1),
      fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.max(0, Math.min(maskWidth - 1, ((x + 0.5) * maskWidth) / width - 0.5));
      const x0 = Math.floor(sx),
        x1 = Math.min(x0 + 1, maskWidth - 1),
        fx = sx - x0;
      const top =
        Number(masks.data[offset + y0 * maskWidth + x0]) * (1 - fx) +
        Number(masks.data[offset + y0 * maskWidth + x1]) * fx;
      const bottom =
        Number(masks.data[offset + y1 * maskWidth + x0]) * (1 - fx) +
        Number(masks.data[offset + y1 * maskWidth + x1]) * fx;
      if (!Number.isFinite(top) || !Number.isFinite(bottom))
        throw new Error("The model returned invalid mask logits.");
      const pixel = (y * width + x) * 4;
      data[pixel] = data[pixel + 1] = data[pixel + 2] = 255;
      data[pixel + 3] = top * (1 - fy) + bottom * fy > 0 ? 255 : 0;
    }
  }
  return data;
}
