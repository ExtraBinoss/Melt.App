import type { InferenceSession, Tensor } from "onnxruntime-web";
import type * as Ort from "onnxruntime-web/webgpu";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import moduleUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import type { ModelDownloadEvent } from "../model/contract";
import { ENCODER_FILE, DECODER_FILE } from "../model/manifest";
import { downloadModelFile } from "./download";

export type OrtRuntime = typeof Ort;
export interface LoadedSam {
  ort: OrtRuntime;
  encoder: InferenceSession;
  decoder: InferenceSession;
  /** Observable execution-provider contract, used by real-model verification. */
  model: { sessions: Record<string, { config: { device: "webgpu"; dtype: "fp16" } }> };
}
export function disposeTensors(values: Record<string, Tensor>): void {
  for (const value of new Set(Object.values(values))) value.dispose();
}
export async function loadSam(
  onProgress?: (event: ModelDownloadEvent) => void,
): Promise<LoadedSam> {
  const { ort, executionProviders } = await gpuRuntime();
  // SAM 3 FP16 weights use external data; embeddings stay on GPU between prompts.
  // ORT records several dispatches before submitting. Immediate release destroys
  // temporary buffers still referenced by those commands; lazyRelease retires
  // them after submission without retaining a storage-buffer reuse cache.
  const encoder = await ort.InferenceSession.create(
    await downloadModelFile(ENCODER_FILE, onProgress),
    {
      executionProviders,
      preferredOutputLocation: "gpu-buffer",
      externalData: [
        {
          path: "vision_encoder_fp16.onnx_data",
          data: await downloadModelFile(`${ENCODER_FILE}_data`, onProgress),
        },
      ],
    },
  );
  try {
    // ORT's WebGPU sessions must initialize sequentially. Never mix WASM providers.
    const decoder = await ort.InferenceSession.create(
      await downloadModelFile(DECODER_FILE, onProgress),
      {
        executionProviders,
        externalData: [
          {
            path: "prompt_encoder_mask_decoder_fp16.onnx_data",
            data: await downloadModelFile(`${DECODER_FILE}_data`, onProgress),
          },
        ],
      },
    );
    onProgress?.({ file: DECODER_FILE, status: "ready" });
    return {
      ort,
      encoder,
      decoder,
      model: {
        sessions: {
          encoder: { config: { device: "webgpu", dtype: "fp16" } },
          decoder: { config: { device: "webgpu", dtype: "fp16" } },
        },
      },
    };
  } catch (error) {
    await encoder.release();
    throw error;
  }
}

export async function gpuRuntime() {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter)
    throw new Error("Segmentation requires WebGPU. Enable a supported GPU or use the magic wand.");
  if (!adapter.features.has("shader-f16"))
    throw new Error(
      "Segmentation requires WebGPU shader-f16 support. Use a supported GPU or the magic wand.",
    );
  const ort = await import("onnxruntime-web/webgpu");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = {
    wasm: new URL(wasmUrl, import.meta.url).href,
    mjs: new URL(moduleUrl, import.meta.url).href,
  };
  const executionProviders: InferenceSession.ExecutionProviderConfig[] = [
    { name: "webgpu", storageBufferCacheMode: "lazyRelease" },
  ];
  return { ort, executionProviders };
}
