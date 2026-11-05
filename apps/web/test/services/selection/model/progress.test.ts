import { expect, test, vi } from "vitest";
import { modelProgressSink } from "../../../../src/services/selection/model/progress";
test("bounds download progress messages to the latest known file and flushes terminal bytes", () => {
  let time = 0;
  const send = vi.fn(),
    sink = modelProgressSink(send, () => time);
  sink.note({ file: "vision_encoder_fp16.onnx", status: "progress", loaded: 10, total: 100 });
  expect(send).toHaveBeenCalledOnce();
  for (let loaded = 11; loaded < 75; loaded++)
    sink.note({ file: "vision_encoder_fp16.onnx", status: "progress", loaded, total: 100 });
  expect(send).toHaveBeenCalledOnce();
  time = 80;
  sink.note({ file: "vision_encoder_fp16.onnx", status: "progress", loaded: 80, total: 100 });
  expect(send).toHaveBeenCalledTimes(2);
  sink.note({ file: "unknown", status: "done" });
  expect(send).toHaveBeenCalledTimes(2);
  sink.note({ file: "vision_encoder_fp16.onnx", status: "done" });
  expect(send).toHaveBeenLastCalledWith({ file: "onnx/vision_encoder_fp16.onnx", status: "done" });
  sink.flush();
  expect(send).toHaveBeenCalledTimes(3);
  const native = modelProgressSink(send);
  native.note({ file: "prompt_encoder_mask_decoder_fp16.onnx", status: "done" });
  expect(send).toHaveBeenCalledTimes(4);
});

test("forwards real automatic-model progress as well as interactive weights", () => {
  const send = vi.fn(),
    sink = modelProgressSink(send);
  sink.note({
    file: "onnx/model_fp16.onnx",
    status: "progress",
    loaded: 4096,
    total: 98484532,
  });
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ file: "onnx/model_fp16.onnx", loaded: 4096 }),
  );
});

test("emits initialization completion immediately even after the final download packet", () => {
  const send = vi.fn(),
    sink = modelProgressSink(send, () => 0);
  sink.note({ file: "onnx/model_fp16.onnx", status: "done" });
  sink.note({ file: "onnx/model_fp16.onnx", status: "ready" });
  expect(send).toHaveBeenLastCalledWith({ file: "onnx/model_fp16.onnx", status: "ready" });
  expect(send).toHaveBeenCalledTimes(2);
});
