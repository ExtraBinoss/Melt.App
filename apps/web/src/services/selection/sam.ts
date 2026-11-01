import type { Tensor } from "onnxruntime-web";
import type { ModelDownloadEvent } from "./model/contract";
import type { LoadedSam } from "./websam/runtime";
import { withModelCacheLock } from "./model/cache";
import { disposeTensors, loadSam } from "./websam/runtime";
import { INPUT_SIZE, prepareImage } from "./websam/image";
import { bestMask } from "./websam/mask";
export { bestMask } from "./websam/mask";

let loading: Promise<LoadedSam> | undefined;
let selecting = false;
let cached:
  | { url: string; width: number; height: number; embeddings: Record<string, Tensor> }
  | undefined;
export function prepareSam(onProgress?: (event: ModelDownloadEvent) => void): Promise<LoadedSam> {
  loading ??= withModelCacheLock(() => loadSam(onProgress)).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
/** Admit one operation even when called without the worker client. */
export async function segmentObject(
  url: string,
  x: number,
  y: number,
  onProgress?: (event: ModelDownloadEvent) => void,
) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0)
    throw new Error("Invalid selection position.");
  if (selecting) throw new Error("Object selection is already running.");
  selecting = true;
  try {
    return await runSelection(url, x, y, onProgress);
  } finally {
    selecting = false;
  }
}
async function runSelection(
  url: string,
  x: number,
  y: number,
  onProgress?: (event: ModelDownloadEvent) => void,
) {
  const { ort, encoder, decoder } = await prepareSam(onProgress);
  if (cached?.url !== url) {
    if (cached) disposeTensors(cached.embeddings);
    cached = undefined;
    const image = await prepareImage(url);
    const input = new ort.Tensor("float32", image.data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    let embeddings: Record<string, Tensor> | undefined;
    try {
      embeddings = await encoder.run({ pixel_values: input }, [
        "feats0",
        "feats1",
        "feats2_no_mem",
      ]);
      if (!["feats0", "feats1", "feats2_no_mem"].every((name) => embeddings![name]))
        throw new Error("The model returned invalid image embeddings.");
      cached = { url, width: image.width, height: image.height, embeddings };
    } catch (error) {
      if (embeddings) disposeTensors(embeddings);
      throw error;
    } finally {
      input.dispose();
    }
  }
  const { width, height, embeddings } = cached;
  if (x < 0 || x >= width || y < 0 || y >= height)
    throw new Error("Selection position is outside the image.");
  const temporary: Record<string, Tensor> = {
    input_points: new ort.Tensor(
      "float32",
      new Float32Array([(x * INPUT_SIZE) / width, (y * INPUT_SIZE) / height, 0, 0]),
      [1, 1, 2, 2],
    ),
    input_labels: new ort.Tensor("int32", new Int32Array([1, -1]), [1, 1, 2]),
  };
  let outputs: Record<string, Tensor> | undefined;
  try {
    outputs = await decoder.run(
      {
        feats0: embeddings.feats0!,
        feats1: embeddings.feats1!,
        feats2_cond: embeddings.feats2_no_mem!,
        ...temporary,
      },
      ["low_res_mask", "iou"],
    );
    if (
      !outputs.low_res_mask ||
      !outputs.iou ||
      outputs.low_res_mask.type !== "float32" ||
      outputs.iou.type !== "float32"
    )
      throw new Error("The model returned no valid masks.");
    return {
      data: bestMask(
        { dims: outputs.low_res_mask.dims, data: outputs.low_res_mask.data as Float32Array },
        { dims: outputs.iou.dims, data: outputs.iou.data as Float32Array },
        width,
        height,
      ),
      width,
      height,
    };
  } finally {
    disposeTensors(temporary);
    if (outputs) disposeTensors(outputs);
  }
}
