import type { InferenceSession } from "onnxruntime-web";
import type { ModelDownloadEvent } from "../selection/model/contract";
import { gpuRuntime, disposeTensors } from "../selection/websam/runtime";
import { downloadModelFile } from "../selection/websam/download";
import { DEPTH_MODEL } from "./manifest";
import { depthPixels } from "./normalization";
/** Worker-only inference. ImageNet normalization and [batch, views, RGB, H, W] are DA3 contracts. */
export async function createDepthModel(
  progress: (event: ModelDownloadEvent) => void,
  beforeGpu: () => Promise<void> = () => Promise.resolve(),
) {
  const { ort, executionProviders } = await gpuRuntime();
  const graph = await downloadModelFile("onnx/model.onnx", progress, DEPTH_MODEL);
  const weights = await downloadModelFile("onnx/model.onnx_data", progress, DEPTH_MODEL);
  await beforeGpu();
  const session = await ort.InferenceSession.create(graph, {
    executionProviders,
    externalData: [{ path: "model.onnx_data", data: weights }],
  });
  progress({ file: "onnx/model.onnx_data", status: "ready" });
  let range: readonly [number, number] | undefined;
  return {
    async frame(pixels: Uint8ClampedArray, width: number, height: number) {
      const area = width * height,
        data = new Float32Array(area * 3);
      const mean = [0.485, 0.456, 0.406],
        std = [0.229, 0.224, 0.225];
      for (let i = 0; i < area; i++)
        for (let c = 0; c < 3; c++)
          data[c * area + i] = (pixels[i * 4 + c]! / 255 - mean[c]!) / std[c]!;
      const input = new ort.Tensor("float32", data, [1, 1, 3, height, width]);
      let outputs: Awaited<ReturnType<InferenceSession["run"]>> | undefined;
      try {
        outputs = await session.run({ pixel_values: input }, ["predicted_depth"]);
        const depth = outputs.predicted_depth;
        if (!depth || depth.type !== "float32") throw Error("DA3 returned no depth prediction.");
        const w = depth.dims.at(-1)!,
          h = depth.dims.at(-2)!;
        const result = depthPixels(depth.data as Float32Array, w, h, range);
        range = result.range; // Retain the clip range while it overlaps; flat openings and cuts can recalibrate.
        return new ImageData(result.data, w, h);
      } finally {
        input.dispose();
        if (outputs) disposeTensors(outputs);
      }
    },
    dispose: () => session.release(),
  };
}
