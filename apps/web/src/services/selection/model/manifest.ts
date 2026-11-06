/** Pinned SAM 2.1 Tiny image predictor; independently downloaded Apache-2.0 weights. */
export const MODEL_ID = "onnx-community/sam2.1-hiera-tiny-ONNX";
export const MODEL_NAME = "SAM 2.1 Tiny";
export const MODEL_REVISION = "814a066640debee5a91e70aa401fb8e17e030503";
// Preserve existing persistence identities so removal also finds the previous model.
export const MODEL_CACHE = "transformers-cache";
export const MODEL_LOCK = "musart.slimsam.model-cache";
export const ENCODER_FILE = "onnx/vision_encoder_fp16.onnx";
export const DECODER_FILE = "onnx/prompt_encoder_mask_decoder_fp16.onnx";
/** Exact pinned Hub blob lengths; excludes shared ONNX Runtime resources. */
export const MODEL_FILES: Readonly<Record<string, number>> = Object.freeze({
  [ENCODER_FILE]: 314925,
  [`${ENCODER_FILE}_data`]: 67005504,
  [DECODER_FILE]: 229799,
  [`${DECODER_FILE}_data`]: 10454016,
});
export const MODEL_HASHES: Readonly<Record<string, string>> = Object.freeze({
  [ENCODER_FILE]: "7773e79d589dada8e1e630cc7eb18b17b2c5b4faeb1eaab5ebf9df618ecbd50a",
  [`${ENCODER_FILE}_data`]: "a4dd3759e9b6a476d991fb3493787992e78777e51462695e1bede71ae258103e",
  [DECODER_FILE]: "00ac7200451f246e8307aa1a1648113f47dc45625738406403a0e6b86c69fc55",
  [`${DECODER_FILE}_data`]: "027b457a53f5bd76bb401c59555448451d04b4eab6d2f6a6758406b40133ee2c",
});
export interface ModelManifest {
  id: string;
  name: string;
  revision: string;
  files: Readonly<Record<string, number>>;
  hashes: Readonly<Record<string, string>>;
}
export const INTERACTIVE_MODEL: ModelManifest = {
  id: MODEL_ID,
  name: MODEL_NAME,
  revision: MODEL_REVISION,
  files: MODEL_FILES,
  hashes: MODEL_HASHES,
};
export const BACKGROUND_MODEL: ModelManifest = {
  id: "studioludens/birefnet-lite-512",
  name: "BiRefNet Lite · 512",
  revision: "962e67969ec6acec9c19fab76acee4f5e22e990c",
  files: { "onnx/model_fp16.onnx": 98484532 },
  hashes: {
    "onnx/model_fp16.onnx": "eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516",
  },
};
/** RVM's recurrent person matte; upstream weights are GPL-3.0, separately downloaded. */
export const VIDEO_BACKGROUND_MODEL: ModelManifest = {
  id: "inverseaibd/rvm_mobilenetv3_fp16",
  name: "RVM MobileNetV3",
  revision: "fc453688f604d0896e12f48df578fdd69ea2b4ac",
  files: { "rvm_mobilenetv3_fp16.onnx": 7503483 },
  hashes: {
    "rvm_mobilenetv3_fp16.onnx": "6a0d5ce6cc17702613be548559879b4521ed424cfe14ddc48d1acaa44d616f64",
  },
};
export const modelBytes = (model: ModelManifest) =>
  Object.values(model.files).reduce((sum, value) => sum + value, 0);
export const MODEL_BYTES = Object.values(MODEL_FILES).reduce((sum, bytes) => sum + bytes, 0);
export function modelFile(file: string, model = INTERACTIVE_MODEL): string | undefined {
  return Object.keys(model.files).find(
    (name) => name === file || name.endsWith(`/${file}`) || file.endsWith(`/${name}`),
  );
}
export function modelUrl(file: string, model = INTERACTIVE_MODEL): string {
  if (!Object.hasOwn(model.files, file)) throw new Error("Unknown segmentation model resource.");
  return `https://huggingface.co/${model.id}/resolve/${model.revision}/${file}`;
}
export function modelCachePath(
  url: string,
  model = INTERACTIVE_MODEL,
): { file: string; current: boolean } | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://huggingface.co") return null;
    for (const id of [
      model.id,
      ...(model === INTERACTIVE_MODEL
        ? [
            "onnx-community/sam3-tracker-ONNX",
            "onnx-community/EdgeTAM-ONNX",
            "diffusionstudio/sam2.1-tiny-video-onnx-fp16",
            "Cr7z676/sam2.1-hiera-tiny-onnx",
            "Xenova/slimsam-77-uniform",
          ]
        : model === BACKGROUND_MODEL
          ? ["runes/birefnet-lite-webgpu"]
          : []),
    ]) {
      const prefix = `/${id}/resolve/`;
      if (!parsed.pathname.startsWith(prefix)) continue;
      const [revision, ...parts] = parsed.pathname.slice(prefix.length).split("/");
      const file = parts.join("/");
      return file ? { file, current: id === model.id && revision === model.revision } : null;
    }
    return null;
  } catch {
    return null;
  }
}
