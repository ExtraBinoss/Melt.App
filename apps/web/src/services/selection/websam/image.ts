export const INPUT_SIZE = 1008;
const mean = [0.5, 0.5, 0.5];
const deviation = [0.5, 0.5, 0.5];

/** SAM 3 stretches the source to a square; unlike SAM 1 there is no padding. */
export async function prepareImage(
  url: string,
  size = INPUT_SIZE,
  means = mean,
  deviations = deviation,
) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image decoding failed (${response.status}).`);
  const image = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(size, size);
  try {
    if (!image.width || !image.height || image.width * image.height > 40_000_000)
      throw new Error("The image dimensions are unsupported for object selection.");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Image preparation is unavailable in this browser.");
    context.drawImage(image, 0, 0, size, size);
    // Native source-image preparation only; editor GPU textures are never read back.
    const pixels = context.getImageData(0, 0, size, size).data;
    const area = size * size;
    const data = new Float32Array(area * 3);
    for (let i = 0; i < area; i++)
      for (let channel = 0; channel < 3; channel++)
        data[channel * area + i] =
          (pixels[i * 4 + channel]! / 255 - means[channel]!) / deviations[channel]!;
    return { data, width: image.width, height: image.height };
  } finally {
    image.close();
    canvas.width = canvas.height = 1;
  }
}
