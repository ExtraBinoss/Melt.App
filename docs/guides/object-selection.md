# Local object selection

Object selection uses SAM 2.1 Tiny in the dedicated selection worker. Images stay
on the device. Its encoder runs once for the current source; subsequent clicks
reuse three GPU-resident embedding tensors and run only the decoder. Changing
sources releases the previous embedding. Cancellation terminates the worker,
releasing its model sessions, tensors and pending work. The magic wand remains
an independent connected flood fill; both algorithms now publish to the same
temporary pixel-selection preview and explicit mask actions.

## Interactive selection

- Select **Object selection** and click an unlocked 2D image. Left-click adds a
  foreground point; right-click adds a background point. Points remain visible
  over the image and every prediction includes the full current prompt set.
- Drag a rectangle to guide detection, or choose **Rectangle** in the local
  selector. Subsequent points refine that rectangle's prediction. Reverse drags
  and transformed/nested image coordinates are supported. A simple click in
  Rectangle mode does not submit a zero-area box.
- **Remove last hint** restores the preceding prompt set, including its box.
  Prompt history and point counts are bounded to 64 entries. **Clear** discards
  the temporary selection. Escape cancels a box/selection without editing the
  document. Leaving the tool cancels inference and retains the last accepted
  pixel selection so it can be refined with the magic wand.
- **Detect objects** samples a 4×4 image-wide grid with real decoder predictions,
  reusing the same encoded source. Proposals below 0.7 predicted IoU, almost-empty
  masks and masks covering over 90% of the image are rejected. A bounded 64×64
  coverage signature suppresses duplicate proposals above 0.85 mask IoU. The
  highest-scoring retained object appears first; numbered buttons select the
  other detected objects as editable point prompts. This is a bounded automatic
  proposal scan, not an exhaustive guarantee that every small object is found.
- The marching-ants outline previews the detected region. **Keep area**, **Erase
  area**, **Invert selection** and **Deselect** use the exact same controller and
  mask command planning as the wand, preserving an existing mask. Only Keep, Erase or
  New layer via copy publishes a document transaction and one undo entry. Corrective clicks,
  proposals, box previews and cancellation do not enter document history.
- During inference, local status appears immediately and mask application is
  disabled. Errors expose technical details and a copy button; a failed preview
  cannot apply an older mask under the failed prompt set.

The algorithm-independent `MaskSelectionPort` in `services/selection/preview.ts`
accepts source-sized alpha coverage. `PixelSelectionController` owns the worker,
preview contours and explicit mask actions; `ObjectSelectionController` owns
only SAM prompts, proposal selection and inference admission. This boundary can
accept other selection producers without adding tool-specific document commands.
The worker retains the exact alpha mask, while the main thread receives bounded
vector preview geometry. There is one model request in flight and one replaceable
latest prompt intent; intermediate clicks do not create an unbounded GPU queue.
Project/page/document/target changes, deselection and disposal invalidate pending
work. Rectangle movement writes its retained SVG directly without React updates.

The selection controls, tool instructions, shared actions and model status messages
are localized in all twelve supported application languages. Translation checks
require matching keys, preserved interpolation tokens and direct locale resources
so a missing translation cannot pass through the English fallback.

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
independent x/y scale factors for point and box coordinates. Foreground/background
labels are 1/0; box corners use labels 2/3, following the
[official SAM 2 image predictor](https://github.com/facebookresearch/sam2/blob/main/sam2/sam2_image_predictor.py).
Point-only prompts include a -1 padding point. The pinned decoder accepts dynamic
`[1,1,N,2]` point coordinates and `[1,1,N]` labels, as documented in its model card. It does not use SAM 1's
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

The client admits one operation and rejects stale responses. Explicit Keep/Erase or Layer via Copy
produces one validated undoable document transaction; inference alone never does. Preparation
and inference can be cancelled. Removing cached model files terminates the
worker, serializes against preparation with the existing named browser lock,
and preserves shared runtime and unrelated model files. Previous SlimSAM
resources in this feature's cache are also recognized for removal.

## Verification

Focused tests cover GPU-only configuration, capability errors before download,
verified cache reuse, corrupted/truncated downloads, point transforms,
highest-IoU reconstruction, single-image embedding reuse and tensor cleanup.
These tests use runtime doubles and do not establish GPU inference correctness.
The interactive controller tests also cover prompt accumulation, latest-intent
coalescing, cancellation, failed previews, bounds and shared undo/redo. The native
`test/browser/object-selection.spec.ts` exercises real pointer input, exclusion
without context menus, rectangle preview/cancellation, proposal selection, shared
contours, decoded GPU exports and document undo/redo. Its deterministic model
worker double tests integration without downloading or claiming real inference.
Actual model execution remains a separate manual/native-model check.

Run the dedicated `bun scripts/verify-segmentation.ts` browser harness for actual
model inference, PNG validation, adapter details and native input-to-RAF
measurements. Store reports in ignored `artifacts/`. Historical SlimSAM CPU and
GPU timings do not establish performance for this SAM 2.1 pipeline; record a new
cohort before making speed or memory claims. The workstation's bounded browser
scope and adapter classification must accompany those results.
