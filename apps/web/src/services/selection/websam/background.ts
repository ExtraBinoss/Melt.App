import type { InferenceSession } from "onnxruntime-web";
import type { ModelDownloadEvent } from "../model/contract";
import { BACKGROUND_MODEL } from "../model/manifest";
import { downloadModelFile } from "./download";
import { gpuRuntime, disposeTensors } from "./runtime";
import { prepareImage } from "./image";
import type { MaskResult } from "../selection";
let session: InferenceSession | undefined;
export async function prepareBackground(onProgress?: (event: ModelDownloadEvent) => void) {
  const runtime = await gpuRuntime();
  session ??= await runtime.ort.InferenceSession.create(
    await downloadModelFile(Object.keys(BACKGROUND_MODEL.files)[0]!, onProgress, BACKGROUND_MODEL),
    { executionProviders: runtime.executionProviders },
  );
  onProgress?.({ file: Object.keys(BACKGROUND_MODEL.files)[0]!, status: "ready" });
  return { ...runtime, session };
}
/** One dedicated matting pass, preserving soft alpha instead of a 16-prompt object scan. */
export async function removeBackground(
  url: string,
  onProgress?: (event: ModelDownloadEvent) => void,
): Promise<MaskResult> {
  const { ort, session } = await prepareBackground(onProgress);
  const image = await prepareImage(url, 512, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]);
  const input = new ort.Tensor("float32", image.data, [1, 3, 512, 512]);
  let outputs: Awaited<ReturnType<InferenceSession["run"]>> | undefined;
  try {
    outputs = await session.run({ input_image: input });
    const logits = outputs[session.outputNames[0]!];
    if (!logits || logits.type !== "float32")
      throw Error("BiRefNet returned no valid alpha matte.");
    const data = alphaMatte(logits.data as Float32Array, logits.dims, image.width, image.height);
    return {
      data,
      seed: foregroundSeed(data, image.width, image.height),
      width: image.width,
      height: image.height,
    };
  } finally {
    input.dispose();
    if (outputs) disposeTensors(outputs);
  }
}
export function alphaMatte(
  logits: Float32Array,
  dims: readonly number[],
  width: number,
  height: number,
) {
  const mw = dims.at(-1)!,
    mh = dims.at(-2)!;
  if (logits.length !== mw * mh || !mw || !mh) throw Error("Invalid BiRefNet alpha dimensions.");
  const probabilities = Float32Array.from(logits, (value) => {
    if (!Number.isFinite(value)) throw Error("Invalid BiRefNet alpha values.");
    return 1 / (1 + Math.exp(-value));
  });
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, Math.min(mh - 1, ((y + 0.5) * mh) / height - 0.5)),
      y0 = Math.floor(sy),
      y1 = Math.min(mh - 1, y0 + 1),
      fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.max(0, Math.min(mw - 1, ((x + 0.5) * mw) / width - 0.5)),
        x0 = Math.floor(sx),
        x1 = Math.min(mw - 1, x0 + 1),
        fx = sx - x0;
      const top = probabilities[y0 * mw + x0]! * (1 - fx) + probabilities[y0 * mw + x1]! * fx;
      const bottom = probabilities[y1 * mw + x0]! * (1 - fx) + probabilities[y1 * mw + x1]! * fx;
      const value = top * (1 - fy) + bottom * fy;
      if (!Number.isFinite(value)) throw Error("Invalid BiRefNet alpha values.");
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = 255 * value;
    }
  }
  return data;
}
export async function releaseBackground() {
  const previous = session;
  session = undefined;
  await previous?.release();
}

/** A real opaque interior hint lets SAM refine an automatic matte with exclusion clicks. */
export function foregroundSeed(data: Uint8ClampedArray, width: number, height: number) {
  let best = -Infinity,
    seed: { x: number; y: number; label: 1 } | undefined;
  for (let row = 0; row < 64; row++)
    for (let col = 0; col < 64; col++) {
      const x = Math.min(width - 1, Math.floor(((col + 0.5) * width) / 64));
      const y = Math.min(height - 1, Math.floor(((row + 0.5) * height) / 64));
      const alpha = data[(y * width + x) * 4 + 3]!;
      const score = alpha - Math.hypot(col - 31.5, row - 31.5);
      if (alpha >= 200 && score > best) {
        best = score;
        seed = { x, y, label: 1 };
      }
    }
  return seed;
}
