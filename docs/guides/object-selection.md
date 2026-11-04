# Background removal and refinement

Select one unlocked, visible 2D image and click **Remove background**. The dock,
search result and S shortcut invoke the same service action. BiRefNet creates an
editable luminance mask directly, with one undo entry. There is no mode chooser,
preview-confirmation step or model-preparation panel in the normal flow.

A compact card shows the original layer's thumbnail and layer name, a throbber,
preparation stage (download / initialization / inference), actual downloaded
megabytes/percentage and cancellation. There is no invented percentage for ORT
initialization or inference. Selection changes do not dismiss or retarget the card;
unrelated document edits may continue, and completion preserves the current
selection. Changing/deleting the source, leaving its page/project or cancelling
invalidates the job. On completion it
offers **Refine**. Only this explicit action enters SAM 3 selection mode; the first
click or rectangle runs the predictor. Hover never runs inference. Click to add,
right-click or Alt-click to exclude, or drag to frame a subject. Hints stay on the
selected layer, and a tooltip explains the gestures in all twelve languages.
**Apply mask** commits one refinement transaction; cancellation discards only the
unapplied hints. Refinement replaces the generated matte instead of intersecting
it with itself, so previously hidden pixels can be recovered. An older clip is
preserved on the existing generated mask source.

## Thread and resource ownership

The dedicated model worker decodes/resizes the original, runs inference, restores
source-sized alpha and encodes the opaque luminance PNG using OffscreenCanvas.
The common removal action returns a Blob and an optional foreground seed. It
never decodes original pixels on the main thread, transfers a raw RGBA matte to
the UI, or constructs selection contours. The main thread reads the encoded Blob
as a data URL and publishes validated mask commands atomically.

Optional refinement continues using the generic `MaskSelectionPort` and its
worker-retained coverage/contours. Refinement still validates the captured document/page/revision and selection;
automatic jobs validate their original layer/asset identity against the current
document, allowing unrelated edits without stale overwrites. Cancellation terminates the worker. Repeated clicks during
the same automatic job share that job. Model handoff disposes the other model's
sessions and embeddings before preparing the requested one. Playback pauses before
starting the automatic action; the canvas renders on demand.

A worker keeps JavaScript work off the UI thread; WebGPU still shares the physical
GPU with rendering. It does not guarantee constant frame rate during inference.
The common path now uses 512×512 input rather than 1024×1024: one quarter of the
input area. Full-resolution mask dimensions and soft alpha are retained, but the
smaller predictor input can lose fine detail. This is not a measured latency claim.

## Pinned local models

| Purpose                       | Model and revision                                                                                                       | Download bytes | License                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------: | -------------------------------------------------------------------------- |
| One-click removal             | [BiRefNet Lite 512](https://huggingface.co/studioludens/birefnet-lite-512/tree/962e67969ec6acec9c19fab76acee4f5e22e990c) |     98,484,532 | [MIT notice](../../apps/web/public/licenses/birefnet-lite-512-LICENSE.txt) |
| Explicit point/box refinement | [SAM 3 Tracker](https://huggingface.co/onnx-community/sam3-tracker-ONNX/tree/429305c8a5b3de597243d919a07e4e6bdcd00ef7)   |    947,233,609 | [SAM License](../../apps/web/public/licenses/sam3-LICENSE.txt)             |

Both use ONNX Runtime Web's WebGPU provider with shader-f16 and deferred buffer
release. Immutable downloads are verified against pinned lengths and SHA-256.
No images are uploaded and unsupported hardware reports a real error. BiRefNet
uses ImageNet normalization, one output logit plane and interpolated sigmoid
alpha. SAM 3 uses 1008-square input, mean/deviation 0.5, int64 labels and cached
GPU embeddings. This is the tracker image predictor, not text-prompt segmentation.
Legacy model cache entries remain identifiable without touching unrelated assets.

## Verification boundary

Focused regressions cover one-click commands, single-entry undo/redo, preservation
of older masks, refinement recovery, worker encoding, cancellation and stale
results. Native scenarios use deterministic ML outputs and decoded GPU exports;
they do not establish real-model quality or inference latency. Following memory
pressure and the user's request, no further inference/stress runs were performed
for this change. The previous load-only check was for the former 1024 export and
does not validate inference with this 512 export.
