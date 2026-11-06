# Background removal and refinement

Select one unlocked, visible 2D image or video and click **Remove background**. The dock,
search result and S shortcut invoke the same service action. For images, BiRefNet creates an
editable luminance mask directly, with one undo entry. There is no mode chooser,
preview-confirmation step or model-preparation panel in the normal flow.

A compact card shows the original layer's thumbnail and layer name, a throbber,
preparation stage (download / initialization / inference), actual downloaded
megabytes/percentage and cancellation. There is no invented percentage for ORT
initialization or inference. Selection changes do not dismiss or retarget the card;
unrelated document edits may continue, and completion preserves the current
selection. Changing/deleting the source, leaving its page/project or cancelling
invalidates the job. On completion it
offers **Refine**. Only this explicit action enters SAM 2.1 Tiny selection mode; the first
click or rectangle runs the predictor. Hover never runs inference. Click to add,
right-click or Alt-click to exclude, or drag to frame a subject. Hints stay on the
selected layer, and a tooltip explains the gestures in all twelve languages.
The shared processing/refinement card is available in Classic and Studio. A click
(including up to 4 px of jitter) makes a point; a primary drag beyond that threshold
makes a rectangle. There is no persistent point/rectangle chooser. Secondary and
Alt clicks add exclusion points and preserve the current rectangle; they do not
open a context menu or pan Studio while refinement owns the gesture.

**Apply mask** commits one refinement transaction; cancellation discards only the
unapplied hints. Refinement replaces the generated matte instead of intersecting
it with itself, so previously hidden pixels can be recovered. An older clip is
preserved on the existing generated mask source.

During every pending stage the shared mascot alternates its naturally blinking
face and native thinking dots, without restarting the cycle at each progress
update. Successful removal crossfades into a green check with a two-second accent;
the green completion label and check remain readable afterward. This decoration
never delays publication or cancellation. Reduced motion uses a still face and
an immediate check, and cancellation/errors do not display a success state.

## Thread and resource ownership

When a card is mounted, an optional presentation lease waits for its thumbnail to
decode and paint before starting GPU work. Hidden tabs and unmounted cards release
the wait; headless calls do not wait for UI. No artificial minimum job duration is
introduced. Runtime readiness is reported as soon as model sessions are initialized,
so inference has its own visible stage instead of extending the initialization label.

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

| Purpose                       | Model and revision                                                                                                         | Download bytes | License                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------: | ----------------------------------------------------------------------------------------------------------------------- |
| One-click removal             | [BiRefNet Lite 512](https://huggingface.co/studioludens/birefnet-lite-512/tree/962e67969ec6acec9c19fab76acee4f5e22e990c)   |     98,484,532 | [MIT notice](../../apps/web/public/licenses/birefnet-lite-512-LICENSE.txt)                                              |
| Explicit point/box refinement | [SAM 2.1 Tiny](https://huggingface.co/onnx-community/sam2.1-hiera-tiny-ONNX/tree/814a066640debee5a91e70aa401fb8e17e030503) |     78,004,244 | [Apache-2.0](../../apps/web/public/licenses/sam2-LICENSE.txt), [notice](../../apps/web/public/licenses/sam2-NOTICE.txt) |

Both use ONNX Runtime Web's WebGPU provider with shader-f16 and deferred buffer
release. Immutable downloads are verified against pinned lengths and SHA-256.
No images are uploaded and unsupported hardware reports a real error. BiRefNet
uses ImageNet normalization, one output logit plane and interpolated sigmoid
alpha. SAM 2.1 Tiny stretches to 1024-square input without padding, with ImageNet
mean [0.485, 0.456, 0.406] and deviation [0.229, 0.224, 0.225], int64 labels and
cached GPU embeddings. This is the image predictor, not text-prompt segmentation.
Legacy SAM 3 and EdgeTAM model cache entries remain identifiable and removable
without touching unrelated assets. Old downloads do not mark the new model ready.
The evaluated EdgeTAM candidate was smaller but slower for repeated prompts on the
verified workstation; the comparison and its limits are in
[Refinement model latency](../performance/refinement-models.md).

## Verification boundary

Focused regressions cover one-click commands, single-entry undo/redo, preservation
of older masks, refinement recovery, worker encoding, cancellation and stale
results. Native scenarios use deterministic ML outputs and decoded GPU exports;
they do not establish real-model quality or inference latency. This section originally covered the removal-flow change only. Real SAM 2.1 Tiny
and EdgeTAM inference, point/box/exclusion checks, encoded PNGs and native
Classic/Studio gesture regressions are now recorded in the model latency report.
Those model checks do not establish BiRefNet quality with its 512 export.

## Video people

The same action accepts an unlocked, visible 2D video. It automatically chooses
RVM MobileNetV3 person matting, rather than running the image model independently
for every frame. This first version keeps people; arbitrary prompted object
tracking remains outside this path. EdgeTAM is designed for video tracking, but the
available Transformers.js/ONNX export inspected here exposes only its image
encoder and prompt decoder, without the temporal memory modules. It is not wired
as a pretend tracker.

One worker sequentially decodes the immutable original, prepares native source
pixels at a maximum 512-pixel edge, retains all four recurrent tensors on WebGPU,
and fetches only the predicted alpha plane for native video encoding. It awaits
encoder backpressure after every frame. The encoded grayscale mask is capped at
96 MiB and source duration at ten minutes. This is a quality/memory bound, not a
real-time performance claim. Thumbnail decoding happens before model work; the
same compact card reports actual processed source time, model bytes, initialization
and cancellation. Point refinement is currently offered for images only. Existing
non-video masks must be removed explicitly before generating a video matte.

The original video and its audio remain unchanged. One reserved engine transaction
and atomic binary persistence install a separate luminance VideoAsset. Its source
clock is the owner's source time minus the owner's first timestamp, plus the matte's
first timestamp. Local UV mapping makes it follow transforms, trims and repeated
occurrences automatically. Render preparation creates ephemeral decoder bindings;
it authors no layers or motion keys. Playback, seeking, thumbnails and export use
the ordinary retained GPU video-texture path, with no live AI inference and no
compositor pixel readbacks. Undo/redo and portable archives retain binary originals
through the existing media lifecycle. Changed/deleted sources and stale project or
page results cannot commit; unrelated edits and selection changes remain allowed.

The separately downloaded [RVM FP16 weights](https://huggingface.co/inverseaibd/rvm_mobilenetv3_fp16/tree/fc453688f604d0896e12f48df578fdd69ea2b4ac)
are pinned at 7,503,483 bytes with SHA-256
`6a0d5ce6cc17702613be548559879b4521ed424cfe14ddc48d1acaa44d616f64`.
They are licensed under GPL-3.0, independently of Melt's MIT code; see
[notice](../../apps/web/public/licenses/rvm-NOTICE.txt) and
[license](../../apps/web/public/licenses/rvm-GPL-3.0.txt). No upstream inference
implementation was copied. The [upstream inference contract](https://github.com/PeterL1n/RobustVideoMatting/blob/master/documentation/inference.md)
specifies RGB 0–1 input, four recurrent states and a soft-alpha output. The pinned
ONNX graph uses source/recurrent/alpha tensors in
FP16 and `downsample_ratio` is FP32. A 512-pixel prepared source uses ratio 1.
RVM explicitly selects the WebGPU NCHW layout. With ONNX Runtime Web 1.31.1 on
Intel Xe LPG, the default layout path produced an almost-black alpha on the real
Second Skin clip, despite valid shapes and finite values. Selecting NCHW restored
the person matte and agreed closely with CPU inference of the same pinned graph.
This setting belongs to the RVM session; SAM and BiRefNet retain their own defaults.

Small deterministic tests cover recurrent handoff/disposal, binary publication,
cancellation, stale results and single-step undo/redo. Native video fixtures check
decoded mask timing and transformed rendering. Real-model verification is opt-in:
run Vite, then `bun scripts/verify-video-matte.ts`. It processes the full ten-second
Second Skin original, checks decoded masks at five source times, and checks the
alpha of transparent PNG exports on both native rendering backends. Set
`MUSART_BASE_URL` to select the Vite server, and optionally `MUSART_RVM_MODEL` to a
local copy of the pinned weights (the production downloader still checks its hash).
Reports, encoded masks and PNGs go to ignored
`artifacts/rvm-second-skin-verification/`. This is functional verification, not a
production latency benchmark. See the [diagnosis](../rendering/rvm-second-skin.md).

Regenerate previously created black video masks after updating: stored mask videos
are immutable and are not changed by a runtime fix. A composition background or
other layers still appear behind a correctly transparent person matte; the Second
Skin template itself has a dark background and additional artistic effects.
