# Depth Anything V3

`depth-anything` is a prepared relative-depth parallax effect, separate from the
native camera `depth-of-field` capability. Add it to an unlocked 2D image or video
and the application immediately opens the same target card used by background
removal. A real video preview is decoded at the clip midpoint in the worker.
The download action continues directly into depth generation; no second Generate
button is needed. The inspector uses **Download model** for an unprepared effect.
Model bytes, processing progress, cancellation, the native loading SVG mascot and
green completion state remain visible independently of inspector/popover closure.
Details live in the card's information tooltip. Catalog browsing downloads no
weights; its representative thumbnail is an existing official Depth Anything 3
image, with source/copyright recorded in `public/effects/DEPTH-ANYTHING-NOTICE.md`.

The separately downloaded Apache-2.0 [DA3 Small ONNX export](https://huggingface.co/onnx-community/depth-anything-v3-small)
is pinned to `0b6a7f3bf5595f9950b91389e0da3a0de130324c` (105,343,155 bytes).
Inference uses ONNX Runtime Web's WebGPU provider in a dedicated module worker.
The existing runtime requires WebGPU and shader-f16 support; inference is not
advertised as available through the renderer's WebGL fallback. The prepared
result renders through Three.js TSL on both WebGPU and WebGL.

Original pixels are decoded and resized in the worker, preserving aspect ratio,
with dimensions rounded to multiples of 14 and a 224-pixel longest edge. DA3 uses
ImageNet normalization and a `[1, 1, 3, height, width]` input. Positive relative
predictions become a near-white grayscale map. For videos the first non-flat frame fixes
the normalization range; subsequent overlapping predictions clamp to it. A
disjoint scene cut recalibrates instead of flattening the whole frame. This avoids
per-frame contrast stretching, but does not make monocular estimates temporally
calibrated, metric or immune to flicker.

Images produce PNG inputs. Videos up to 60 seconds produce a native encoded depth
clip, one decoded frame and one inference at a time. There is no frame queue or
AI inference during playback. Native encoders use a bounded 96 MiB output writer;
unsupported codecs and incomplete clips fail visibly. Model tensors, sessions,
bitmaps, decoded samples, demuxers and encoders are released on completion;
cancellation terminates the worker, including active downloads and inference.
No editor/compositor GPU texture is read into JavaScript.

The result is attached as an ordinary effect input. Image admission and reference
change form one engine transaction. Video originals and their references use a
reserved engine/storage transaction; stale owners, missing originals and failed
persistence do not publish a result. Undo/redo restores the reference and asset
together. Video input textures use the owner's source-local clock, including
first timestamps, trims, occurrences and exact export seeks. They share existing
video decoder, GPU allocation and stream budgets.

The default display is the grayscale depth map for both images and video. The
optional parallax TSL node uses four bounded inverse-warp iterations, configurable relief,
direction, fixed depth plane and edge zoom. The depth view displays the
actual prepared map. Missing inputs and amount zero preserve the original source.
Animate the ordinary SDK scalar parameters with sparse Motion keys. Large warps
may stretch occlusion boundaries: a single image cannot reconstruct hidden areas.
For pixel alignment, generate from the original layer before adding other effects
that displace geometry. Composition owners cannot generate a source depth map.

Focused checks live in `apps/web/test/services/depth`,
`packages/core/test/effects/depth-anything`,
`packages/render/test/surface/video-effect-inputs.test.ts` and
`test/browser/depth-anything.spec.ts`. The native witness uses the real pinned V3
weights, both rendering backends, exact forward/backward video seeks, native
encoding, zero-strength equivalence, a nonmodal focus check, a 50-image workload and an input-to-frame
probe. Run it against Vite as the other `/@fs` witnesses do; captures belong in
ignored `artifacts/depth-anything/`.

Local verification on 2026-11-06 used headless Chromium on Linux against Vite.
The real V3 worker, image WebGPU/WebGL rendering, native video encoding/seeks and
nonmodal keyboard focus checks passed. The 50-image WebGPU witness used 3,566,192
cache bytes within a 33,554,432-byte budget, with 50 effect passes, one deduplicated
source upload and zero compositor readbacks. The development input probe reported
13.8 ms from native click handling through two animation frames during preparation;
this is an environment-specific observation, not a production latency guarantee.
Core typechecking and focused lint passed. Global typechecking still reports
existing errors in unrelated tests and catalog fixtures.

The application waits for the decoded thumbnail and the native SVG loading card
to paint before initializing GPU inference. Active shared throbbers render the
brand engine directly, without a raster fallback. Native checks sample four
seconds of sustained dot animation and verify the background-removal face/dot
cycle as well as the first SVG paint. The initialized model is retained from
the download step into generation instead of rereading/revalidating 105 MB of
weights. Only the depth output is requested from ORT. Native preparation and shape
operations still run in the worker; this is not a claim that all ONNX operators or
JavaScript preprocessing run on GPU.

Each new GPU initialization/inference needs a worker/main-thread permit. The
scheduler waits at least 75 ms between jobs, holds new jobs while a pointer is down,
for 120 ms after keyboard/wheel input, and while the document is hidden. It uses
no React updates. Already submitted GPU work cannot be interrupted; lower 224 px
inference resolution reduces its work. Timers/listeners/permits are disposed on
completion/cancellation. This pacing is a responsiveness safeguard, not a guarantee
of zero latency on all adapters. Earlier 322 px timing observations above are not
measurements of this revised scheduler.

The real-worker native witness also instruments actual WebGPU queue submissions
in the inference worker (475 submissions for the image job in the recorded run),
separately from the Three.js renderer. This proves GPU inference dispatch, not
that preprocessing or every ONNX shape operator runs on GPU.
