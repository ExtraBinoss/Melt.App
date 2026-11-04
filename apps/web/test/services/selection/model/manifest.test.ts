import { expect, test } from "vitest";
import {
  MODEL_BYTES,
  MODEL_FILES,
  MODEL_ID,
  MODEL_REVISION,
  modelCachePath,
  modelFile,
} from "../../../../src/services/selection/model/manifest";
test("pins exact model blob lengths and recognizes only its own Hub namespace", () => {
  expect(MODEL_BYTES).toBe(947233609);
  expect(Object.isFrozen(MODEL_FILES)).toBe(true);
  expect(modelFile("vision_encoder_fp16.onnx")).toBe("onnx/vision_encoder_fp16.onnx");
  expect(modelFile("prompt_encoder_mask_decoder_fp16.onnx")).toBe(
    "onnx/prompt_encoder_mask_decoder_fp16.onnx",
  );
  expect(modelFile("arbitrary.bin")).toBeUndefined();
  const base = `https://huggingface.co/${MODEL_ID}/resolve/`;
  expect(modelCachePath(`${base}${MODEL_REVISION}/onnx/vision_encoder_fp16.onnx`)).toEqual({
    file: "onnx/vision_encoder_fp16.onnx",
    current: true,
  });
  expect(modelCachePath(`${base}old/prompt_encoder_mask_decoder_fp16.onnx`)).toEqual({
    file: "prompt_encoder_mask_decoder_fp16.onnx",
    current: false,
  });
  for (const bad of [
    "bad",
    `${base}${MODEL_REVISION}/`,
    base.replace("huggingface.co", "example.com"),
    "https://huggingface.co/another/model/resolve/main/prompt_encoder_mask_decoder_fp16.onnx",
  ])
    expect(modelCachePath(bad)).toBeNull();
});
