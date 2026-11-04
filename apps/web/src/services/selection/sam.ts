import { promptTensors, type SelectionPrompt } from "./prompts";
import type { Tensor } from "onnxruntime-web";
import type { ModelDownloadEvent } from "./model/contract";
import type { LoadedSam } from "./websam/runtime";
import { withModelCacheLock } from "./model/cache";
import { disposeTensors, loadSam } from "./websam/runtime";
import { INPUT_SIZE, prepareImage } from "./websam/image";
import { bestIndex, bestMask } from "./websam/mask";
export { bestIndex, bestMask } from "./websam/mask";

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
  return segmentPrompt(url, { points: [{ x, y, label: 1 }] }, onProgress);
}
export async function segmentPrompt(
  url: string,
  prompt: SelectionPrompt,
  onProgress?: (event: ModelDownloadEvent) => void,
) {
  if (selecting) throw new Error("Object selection is already running.");
  selecting = true;
  try {
    return await runSelection(url, prompt, onProgress);
  } finally {
    selecting = false;
  }
}
async function runSelection(
  url: string,
  prompt: SelectionPrompt,
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
        "image_embeddings.0",
        "image_embeddings.1",
        "image_embeddings.2",
      ]);
      if (
        !["image_embeddings.0", "image_embeddings.1", "image_embeddings.2"].every(
          (name) => embeddings![name],
        )
      )
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
  const inputs = promptTensors(prompt, width, height, INPUT_SIZE);
  const temporary: Record<string, Tensor> = {
    input_points: new ort.Tensor("float32", inputs.coordinates, [1, 1, inputs.count, 2]),
    input_boxes: new ort.Tensor("float32", new Float32Array(0), [1, 0, 4]),
    input_labels: new ort.Tensor("int64", BigInt64Array.from(inputs.labels, BigInt), [
      1,
      1,
      inputs.count,
    ]),
  };
  let outputs: Record<string, Tensor> | undefined;
  try {
    outputs = await decoder.run(
      {
        ...embeddings,
        ...temporary,
      },
      ["pred_masks", "iou_scores", "object_score_logits"],
    );
    if (
      !outputs.pred_masks ||
      !outputs.iou_scores ||
      outputs.pred_masks.type !== "float32" ||
      outputs.iou_scores.type !== "float32"
    )
      throw new Error("The model returned no valid masks.");
    return {
      data: bestMask(
        { dims: outputs.pred_masks.dims, data: outputs.pred_masks.data as Float32Array },
        { dims: outputs.iou_scores.dims, data: outputs.iou_scores.data as Float32Array },
        width,
        height,
      ),
      width,
      height,
      score: Number(
        outputs.iou_scores.data[
          bestIndex({
            dims: outputs.iou_scores.dims,
            data: outputs.iou_scores.data as Float32Array,
          })
        ],
      ),
    };
  } finally {
    disposeTensors(temporary);
    if (outputs) disposeTensors(outputs);
  }
}

/** Release the previous algorithm before admitting another GPU model. */
export async function releaseSam() {
  if (cached) disposeTensors(cached.embeddings);
  cached = undefined;
  const pending = loading;
  loading = undefined;
  if (pending) {
    const sam = await pending;
    await sam.decoder.release();
    await sam.encoder.release();
  }
}
