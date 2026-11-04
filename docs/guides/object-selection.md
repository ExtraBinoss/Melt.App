# Background removal and object selection

Select one unlocked, visible 2D image, then activate **Remove background**.
The tool stays on the selected image, including when other layers overlap it or
when the pointer leaves its bounds. It does not sample the whole composition.

- **Remove background** runs BiRefNet Lite once and displays a temporary selection.
  It does not publish a document edit or silently apply the result.
- Click a subject, or drag a rectangle around it, to guide SAM 3. There is no
  Points/Rectangle mode switch. Left-click adds foreground hints; right-click or
  Alt-click adds background hints. A real opaque point from the automatic matte
  seeds subsequent SAM refinement. A new rectangle starts a fresh prompt set.
- After explicitly preparing SAM 3, hovering for 250 ms previews a candidate.
  Hover never starts a model download. Clicking commits that hint; moving away
  discards an unconfirmed hover preview. Hover hints do not accumulate.
- The shaded region and marching ants identify the selection. This bounded vector
  preview is an approximation of the exact mask retained in the worker; soft
  matting alpha is preserved when applying the mask.
- **Apply mask** keeps the selection and hides its surroundings using the existing
  validated mask commands. The original image and previous mask are preserved.
  Apply produces one reversible document transaction. Clear/cancel, inference,
  hints and previews do not enter document history. Shared selection actions also
  support Keep, Erase, Invert and Layer via Copy/Cut.
- Undo the last hint or cancel the preview at any time. Escape cancels a rectangle.
  Failed inference disables applying the previous mask and exposes copyable details.
- **Local AI models** contains preparation, real download progress and cache
  removal. It opens automatically while a model loads or initialization fails.
  Controls and instructions are localized in all twelve application languages.

## Local model backends

Both producers run in the dedicated worker with ONNX Runtime Web's WebGPU provider
and require `shader-f16`. Unsupported hardware reports a real error; the magic
wand remains independently available. No images are uploaded. Downloads use
immutable Hub URLs, pinned lengths and SHA-256 verification before inference.

| Purpose                         | Model and immutable revision                                                                                           | Weight bytes | License                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -----------: | -------------------------------------------------------------- |
| Interactive points / rectangles | [SAM 3 Tracker](https://huggingface.co/onnx-community/sam3-tracker-ONNX/tree/429305c8a5b3de597243d919a07e4e6bdcd00ef7) |  947,233,609 | [SAM License](../../apps/web/public/licenses/sam3-LICENSE.txt) |
| Automatic background matting    | [BiRefNet Lite](https://huggingface.co/runes/birefnet-lite-webgpu/tree/d553b221039609f1ab170e3c2e651b59f363c98a)       |  123,224,205 | MIT                                                            |

SAM 3 here is the interactive tracker image predictor, not text-prompt concept
segmentation. Its FP16 graph and external weights replace the old SAM 2.1 Tiny
pipeline. It stretches input to 1008 square pixels, normalizes channels with mean
and deviation 0.5, caches three GPU embedding tensors and runs the decoder for
subsequent prompts. Labels are int64. The best finite predicted-IoU mask is chosen
and resized to the original dimensions. The WebGPU-prepared BiRefNet export folds static shapes offline, bounds wide
Split/Concat operations and replaces variadic Sum with Add chains. No runtime
graph surgery is added to Melt. BiRefNet stretches to 1024 square pixels,
uses ImageNet normalization and converts output logits to interpolated soft alpha.

The worker releases the other algorithm's sessions and embeddings before loading
a new one. Model status follows actual session lifetime; disk cache availability
is separate from GPU readiness. Cancellation terminates the worker and invalidates
both readiness states. The ORT provider uses `lazyRelease` so queued buffers are
not destroyed before command submission. Sessions initialize sequentially.

The generic `MaskSelectionPort` accepts source-sized coverage from either producer.
`PixelSelectionController` owns the exact alpha, bounded vector contours and
explicit document actions. `ObjectSelectionController` owns prompts and admission:
one active prediction and one replaceable latest intent. Project/page changes,
selection changes, disposal and cancellation invalidate asynchronous results.
Rectangle movement writes retained SVG geometry directly without root React work.
The original-image preparation and ML output processing are independent of the
editor compositor: its GPU textures are never read back into JavaScript.

## Verification boundaries

Focused tests cover pinned resources, independent model/cache progress, GPU-only
configuration, session handoff, tensor cleanup, soft alpha, target locking,
latest-intent admission, cancellation and reversible commands. Native browser
checks use deterministic model-worker outputs to exercise actual pointer input,
localized layout, selection preview and a decoded GPU export. These doubles do
not establish model quality, real-model compatibility or inference latency.

Actual model execution is a separate native GPU check. Record browser, hardware
adapter, source dimensions, cold download/initialization, warm decoder latency
and memory separately. Do not reuse historical SAM 2.1 timing claims for SAM 3.

On 2026-11-04, preparation of the pinned WebGPU BiRefNet export completed on a
hardware Intel Xe-LPG adapter in a separate 1,400 MiB memory-limited Chromium
scope. Input/output names matched the adapter contract. This was a load-only
check: no inference was executed with that export, and SAM 3 was not loaded in
that check. Further model stress runs were stopped at the user's request after
memory pressure from earlier experiments. The source SAM 2.1 benchmark cannot
be reused to claim performance or quality for these new backends.
