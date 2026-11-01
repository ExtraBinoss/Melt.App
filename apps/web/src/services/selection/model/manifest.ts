/** Public Apache-2.0 SAM 2.1 export; WebSAM's private signed model endpoint is not used. */
export const MODEL_ID = "diffusionstudio/sam2.1-tiny-video-onnx-fp16";
export const MODEL_NAME = "SAM 2.1 Tiny · 512";
export const MODEL_REVISION = "66673b5db39371b7dd7847f4d3bc0d4f4179b79e";
// Preserve existing persistence identities so removal also finds the previous model.
export const MODEL_CACHE = "transformers-cache";
export const MODEL_LOCK = "musart.slimsam.model-cache";
export const ENCODER_FILE = "onnx/vision_encoder.onnx";
export const DECODER_FILE = "onnx/mask_decoder.onnx";
/** Exact pinned Hub blob lengths; excludes shared ONNX Runtime resources. */
export const MODEL_FILES: Readonly<Record<string, number>> = Object.freeze({
  [ENCODER_FILE]: 58385353,
  [DECODER_FILE]: 8898805,
});
export const MODEL_HASHES: Readonly<Record<string, string>> = Object.freeze({
  [ENCODER_FILE]: "24e9ccf5994be5c8dd93ebe771a4cc4f8bb122d0524555ac3ba4e7141710b133",
  [DECODER_FILE]: "6bc158b0d028777ca2e25203ece0f27429c436de39a5c7fe301b3858d6059789",
});
export const MODEL_BYTES = Object.values(MODEL_FILES).reduce((sum, bytes) => sum + bytes, 0);
export function modelFile(file: string): string | undefined {
  return Object.keys(MODEL_FILES).find(
    (name) => name === file || name.endsWith(`/${file}`) || file.endsWith(`/${name}`),
  );
}
export function modelUrl(file: string): string {
  if (!Object.hasOwn(MODEL_FILES, file)) throw new Error("Unknown segmentation model resource.");
  return `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/${file}`;
}
export function modelCachePath(url: string): { file: string; current: boolean } | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://huggingface.co") return null;
    for (const id of [MODEL_ID, "Cr7z676/sam2.1-hiera-tiny-onnx", "Xenova/slimsam-77-uniform"]) {
      const prefix = `/${id}/resolve/`;
      if (!parsed.pathname.startsWith(prefix)) continue;
      const [revision, ...parts] = parsed.pathname.slice(prefix.length).split("/");
      const file = parts.join("/");
      return file ? { file, current: id === MODEL_ID && revision === MODEL_REVISION } : null;
    }
    return null;
  } catch {
    return null;
  }
}
