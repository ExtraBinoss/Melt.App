import type { ModelManifest } from "../selection/model/manifest";
/** Apache-2.0 upstream DA3 Small export. No weights are bundled with the application. */
export const DEPTH_MODEL: ModelManifest = {
  id: "onnx-community/depth-anything-v3-small",
  name: "Depth Anything V3 Small",
  revision: "0b6a7f3bf5595f9950b91389e0da3a0de130324c",
  files: { "onnx/model.onnx": 640691, "onnx/model.onnx_data": 104702464 },
  hashes: {
    "onnx/model.onnx": "396008798244a074297fd88e450433b1357fc687f534939375c804ded86e7b2a",
    "onnx/model.onnx_data": "802bb24741e67f5bb2b369fc64d40afe11439cc895d676d658d65cfb75c9860f",
  },
};
