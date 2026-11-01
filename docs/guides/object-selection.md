# Local object selection

Object selection uses SAM 2.1 Tiny in the dedicated selection worker. Images stay
on the device. Its encoder runs once for the current source; subsequent clicks
reuse three GPU-resident embedding tensors and run only the decoder. Changing
sources releases the previous embedding. Cancellation terminates the worker,
releasing its model sessions, tensors and pending work. The magic wand remains
an independent connected flood fill.

## Model and runtime

The requested [WebSAM project](https://github.com/Xevion/WebSAM) demonstrates
SAM 2.1 with a preoptimized ORT encoder and an ONNX decoder on WebGPU. It is a
Svelte application rather than a published SDK, has no published source license,
and obtains its model files through its own signed private R2 endpoint. Melt
therefore implements that model/runtime architecture independently using a
public Apache-2.0 export; no WebSAM application source is copied.

- Model: `diffusionstudio/sam2.1-tiny-video-onnx-fp16`.
- Immutable revision: `66673b5db39371b7dd7847f4d3bc0d4f4179b79e`.
- License/provenance: [pinned model card](https://huggingface.co/diffusionstudio/sam2.1-tiny-video-onnx-fp16/blob/66673b5db39371b7dd7847f4d3bc0d4f4179b79e/README.md), derived from Meta SAM 2.1 Tiny, Apache-2.0.
- Runtime: ONNX Runtime Web, MIT; direct `onnxruntime-web/webgpu` import.
- Precision: FP16 weights and compute, with FP32 model inputs/outputs. Both sessions
  explicitly require only the WebGPU provider and shader-f16 support. The native
  provider uses `lazyRelease` for temporary storage buffers: release happens after
  command submission, preventing ORT from destroying a buffer still referenced by
  queued WebGPU commands. Inference requests are serialized before replacing cached
  image embeddings.
- Unsupported WebGPU or failed initialization returns an actual error. The
  interface never claims a CPU session is GPU execution. Magic wand is available
  independently.

| Required file              | Exact bytes | SHA-256                                                            |
| -------------------------- | ----------: | ------------------------------------------------------------------ |
| `onnx/vision_encoder.onnx` |  58,385,353 | `24e9ccf5994be5c8dd93ebe771a4cc4f8bb122d0524555ac3ba4e7141710b133` |
| `onnx/mask_decoder.onnx`   |   8,898,805 | `6bc158b0d028777ca2e25203ece0f27429c436de39a5c7fe301b3858d6059789` |

The model download totals **67,284,158 bytes (64 MiB)**, excluding the shared
runtime and physical browser-storage overhead. These lengths and hashes come
from the [pinned Hub metadata](https://huggingface.co/api/models/diffusionstudio/sam2.1-tiny-video-onnx-fp16/revision/66673b5db39371b7dd7847f4d3bc0d4f4179b79e?blobs=true).
Each downloaded or cached file is checked against its length and SHA-256 before
inference. Model progress uses streamed bytes and reports initialization
separately. Cache writes are awaited and real storage errors are reported.

The initial 1024 FP32 encoder exceeded a bounded 2.6 GB browser scope during
real inference on the integrated Intel GPU. This 512 FP16 export reduces the
input area fourfold and halves compute precision; its actual memory and timing
must still be measured by the native browser gate.

## Geometry and resource ownership

SAM 2 stretches the image to 512 × 512, normalizes ImageNet RGB values and uses
independent x/y scale factors for point coordinates. It does not use SAM 1's
longest-edge padding. Decoder logits are interpolated to original image
coordinates before thresholding, and the decoder chooses its candidate inside the graph using SAM 2 video predictor
selection and returns that real mask and IoU. Only this mask is resized. Output
alpha is binary. The 512 inference resolution reduces activation memory; small
objects and thin structures have less detail than the 1024 model. The returned
mask still has the original source dimensions.

The encoder's three outputs stay on GPU between clicks. Only the decoder's model
mask outputs are returned to CPU for native PNG encoding. This is ML output,
not a readback of the editor's render/composition textures. Source image
preparation uses browser decoding and an OffscreenCanvas. Temporary input and
output tensors are disposed after each request, including error paths.

The client admits one operation and rejects stale responses. One completed
selection produces one validated undoable document transaction. Preparation
and inference can be cancelled. Removing cached model files terminates the
worker, serializes against preparation with the existing named browser lock,
and preserves shared runtime and unrelated model files. Previous SlimSAM
resources in this feature's cache are also recognized for removal.

## Verification

Focused tests cover GPU-only configuration, capability errors before download,
verified cache reuse, corrupted/truncated downloads, point transforms,
highest-IoU reconstruction, single-image embedding reuse and tensor cleanup.
These tests use runtime doubles and do not establish GPU inference correctness.

Run the dedicated `bun scripts/verify-segmentation.ts` browser harness for actual
model inference, PNG validation, adapter details and native input-to-RAF
measurements. Store reports in ignored `artifacts/`. Historical SlimSAM CPU and
GPU timings do not establish performance for this SAM 2.1 pipeline; record a new
cohort before making speed or memory claims. The workstation's bounded browser
scope and adapter classification must accompany those results.
