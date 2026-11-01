import type {
  ProgressInfo,
  RawImage,
  SamModel,
  SamProcessor,
  Tensor,
  ones,
} from "@huggingface/transformers";
import { MODEL_ID as MODEL, MODEL_REVISION as REVISION } from "./model/manifest";
import { withModelCacheLock } from "./model/cache";
import type { ModelDownloadEvent } from "./model/contract";
interface Inputs {
  pixel_values: Tensor;
  original_sizes: [number, number][];
  reshaped_input_sizes: [number, number][];
}
interface Loaded {
  model: SamModel;
  processor: SamProcessor;
  RawImage: typeof RawImage;
  ones: typeof ones;
}
let loading: Promise<Loaded> | undefined;
let cached:
  | {
      url: string;
      inputs: Omit<Inputs, "pixel_values">;
      embeddings: Awaited<ReturnType<SamModel["get_image_embeddings"]>>;
    }
  | undefined;
export function prepareSam(onProgress?: (event: ModelDownloadEvent) => void): Promise<Loaded> {
  loading ??= withModelCacheLock(async () => {
    const {
      SamModel: Model,
      AutoProcessor,
      RawImage,
      ones,
      env,
    } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
    const options = {
      revision: REVISION,
      ...(onProgress
        ? {
            progress_callback: (info: ProgressInfo) => {
              if (info.status === "progress" || info.status === "done") onProgress(info);
            },
          }
        : {}),
    };
    const processor = (await AutoProcessor.from_pretrained(MODEL, {
      ...options,
    })) as SamProcessor;
    // Dedicated single-threaded CPU inference leaves the editor GPU available.
    // Full-GPU and mixed sessions exceeded a 2.2 GB browser budget on Intel.
    const model = (await Model.from_pretrained(MODEL, {
      ...options,
      device: "wasm",
      dtype: "fp32",
    })) as SamModel;
    return { model, processor, RawImage, ones };
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
export function bestMask(masks: Tensor, scores: Tensor, width: number, height: number) {
  if (masks.data.length < width * height * scores.data.length)
    throw new Error("Le modèle n’a retourné aucun masque valide.");
  return maskPixels(masks, width, height, bestIndex(scores));
}
function maskPixels(masks: Tensor, width: number, height: number, best = 0) {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    output[offset] = 255;
    output[offset + 1] = 255;
    output[offset + 2] = 255;
    output[offset + 3] = Number(masks.data[best * width * height + i]) ? 255 : 0;
  }
  return output;
}
function bestIndex(scores: Tensor): number {
  const values = Array.from(scores.data, Number);
  if (!values.length || values.some((value) => !Number.isFinite(value)))
    throw new Error("Le modèle n’a retourné aucun masque valide.");
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  return best;
}
export async function segmentObject(
  url: string,
  x: number,
  y: number,
  onProgress?: (event: ModelDownloadEvent) => void,
) {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error("Position de sélection invalide.");
  const { model, processor, RawImage, ones } = await prepareSam(onProgress);
  if (cached?.url !== url) {
    // Release the previous source before allocating another encoder input/embedding.
    if (cached) Object.values(cached.embeddings).forEach((tensor) => tensor.dispose());
    cached = undefined;
    const image = await RawImage.read(url);
    const inputs = (await processor(image)) as Inputs;
    try {
      const embeddings = await model.get_image_embeddings({ pixel_values: inputs.pixel_values });
      const { original_sizes, reshaped_input_sizes } = inputs;
      cached = { url, inputs: { original_sizes, reshaped_input_sizes }, embeddings };
    } finally {
      inputs.pixel_values.dispose();
    }
  }
  const { inputs, embeddings } = cached;
  const input_points = processor.reshape_input_points(
    [[[x, y]]],
    inputs.original_sizes,
    inputs.reshaped_input_sizes,
  ) as Tensor;
  const temporary: Tensor[] = [input_points];
  try {
    const input_labels = ones(input_points.dims.slice(0, -1));
    temporary.push(input_labels);
    const result = await model({ ...embeddings, input_points, input_labels });
    temporary.push(result.pred_masks, result.iou_scores);
    const best = bestIndex(result.iou_scores);
    // Preserve all five dimensions, but upscale only the winning low-resolution mask.
    const selected = result.pred_masks.slice(null, null, [best, best + 1]);
    temporary.push(selected);
    const masks = (await processor.post_process_masks(
      selected,
      inputs.original_sizes,
      inputs.reshaped_input_sizes,
    )) as Tensor[];
    temporary.push(...masks);
    const [height, width] = inputs.original_sizes[0]!;
    if (!masks[0] || masks[0].data.length !== width * height)
      throw new Error("Le modèle n’a retourné aucun masque valide.");
    // The winning candidate is now the only mask; its original IoU no longer indexes it.
    return { data: maskPixels(masks[0], width, height), width, height };
  } finally {
    for (const tensor of new Set(temporary)) tensor.dispose();
  }
}
