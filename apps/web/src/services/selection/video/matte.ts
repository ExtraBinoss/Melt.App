import type { InferenceSession, Tensor } from "onnxruntime-web";
import { VIDEO_BACKGROUND_MODEL } from "../model/manifest";
import type { ModelDownloadEvent } from "../model/contract";
import { downloadModelFile } from "../websam/download";
import { disposeTensors, gpuRuntime } from "../websam/runtime";

const inputs = ["r1i", "r2i", "r3i", "r4i"];
const outputs = ["r1o", "r2o", "r3o", "r4o"];
/** RGB source bytes to positive IEEE-754 half floats, normalized to [0, 1]. */
export function halfUnit(value: number): number {
  if (value === 0) return 0;
  const exponent = Math.floor(Math.log2(value));
  if (exponent < -14) return Math.round(value * 2 ** 24);
  return (exponent + 15) * 1024 + Math.round((value / 2 ** exponent - 1) * 1024);
}
export function halfValue(value: number): number {
  const exponent = (value >>> 10) & 31,
    fraction = value & 1023;
  if (exponent === 31) throw Error("RVM returned an invalid alpha value.");
  const result =
    exponent === 0 ? fraction * 2 ** -24 : (1 + fraction / 1024) * 2 ** (exponent - 15);
  return value & 32768 ? -result : result;
}
const bytes = Uint16Array.from({ length: 256 }, (_, i) => halfUnit(i / 255));

/** One sequential recurrent owner. Only the alpha output crosses back to CPU for native encoding. */
export async function createPersonMatte(onProgress?: (event: ModelDownloadEvent) => void) {
  const { ort, executionProviders } = await gpuRuntime();
  const file = Object.keys(VIDEO_BACKGROUND_MODEL.files)[0]!;
  const session = await ort.InferenceSession.create(
    await downloadModelFile(file, onProgress, VIDEO_BACKGROUND_MODEL),
    {
      executionProviders,
      preferredOutputLocation: Object.fromEntries(
        outputs.map((name) => [name, "gpu-buffer" as const]),
      ),
    },
  );
  let states: Record<string, Tensor> = Object.fromEntries(
    inputs.map((name) => [name, new ort.Tensor("float16", new Uint16Array(1), [1, 1, 1, 1])]),
  );
  const ratio = new ort.Tensor("float32", new Float32Array([1]), [1]);
  onProgress?.({ file, status: "ready" });
  return {
    async frame(pixels: Uint8ClampedArray, width: number, height: number) {
      const area = width * height;
      const data = new Uint16Array(area * 3);
      for (let i = 0; i < area; i++)
        for (let c = 0; c < 3; c++) data[c * area + i] = bytes[pixels[i * 4 + c]!]!;
      const src = new ort.Tensor("float16", data, [1, 3, height, width]);
      let result: InferenceSession.ReturnType | undefined;
      try {
        result = await session.run({ src, ...states, downsample_ratio: ratio }, [
          "pha",
          ...outputs,
        ]);
        const alpha = result.pha;
        if (
          !alpha ||
          alpha.type !== "float16" ||
          alpha.dims.at(-1) !== width ||
          alpha.dims.at(-2) !== height
        )
          throw Error("RVM returned an invalid person matte.");
        const values = await alpha.getData();
        if (!ArrayBuffer.isView(values) || values.byteLength !== area * 2)
          throw Error("RVM returned an incomplete alpha plane.");
        // ORT exposes Float16Array on modern browsers and Uint16Array elsewhere.
        // Always read the underlying half-float bits, including sliced tensor views.
        const bits = new Uint16Array(values.buffer, values.byteOffset, area);
        const rgba = new Uint8ClampedArray(area * 4);
        for (let i = 0; i < area; i++) {
          const a = Math.max(0, Math.min(1, halfValue(bits[i]!))) * 255;
          rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = a;
          rgba[i * 4 + 3] = 255;
        }
        for (const name of outputs)
          if (!result[name]) throw Error("RVM returned no recurrent video state.");
        disposeTensors(states);
        states = Object.fromEntries(inputs.map((name, i) => [name, result![outputs[i]!]!]));
        result = Object.fromEntries(
          Object.entries(result).filter(([name]) => !outputs.includes(name)),
        );
        return rgba;
      } finally {
        src.dispose();
        if (result) disposeTensors(result);
      }
    },
    async dispose() {
      disposeTensors(states);
      states = {};
      ratio.dispose();
      await session.release();
    },
  };
}
