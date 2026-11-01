export const INPUT_SIZE = 512;
const mean = [0.485, 0.456, 0.406];
const deviation = [0.229, 0.224, 0.225];

/** SAM 2 stretches the source to a square; unlike SAM 1 there is no padding. */
export async function prepareImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image decoding failed (${response.status}).`);
  const image = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
  try {
    if (!image.width || !image.height || image.width * image.height > 40_000_000)
      throw new Error("The image dimensions are unsupported for object selection.");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Image preparation is unavailable in this browser.");
    context.drawImage(image, 0, 0, INPUT_SIZE, INPUT_SIZE);
    // Native source-image preparation only; editor GPU textures are never read back.
    const pixels = context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
    const area = INPUT_SIZE * INPUT_SIZE;
    const data = new Float32Array(area * 3);
    for (let i = 0; i < area; i++)
      for (let channel = 0; channel < 3; channel++)
        data[channel * area + i] =
          (pixels[i * 4 + channel]! / 255 - mean[channel]!) / deviation[channel]!;
    return { data, width: image.width, height: image.height };
  } finally {
    image.close();
    canvas.width = canvas.height = 1;
  }
}
