# Image-refinement model comparison

Verified on November 6, 2026. The shipped predictor is **SAM 2.1 Tiny FP16**.
EdgeTAM was evaluated first as requested, but repeated point corrections were
slower on this workstation. This is a bounded functional/latency comparison,
not a general segmentation-quality benchmark or a universal model ranking.

## Candidates and decision

| Predictor               | Pinned ONNX download bytes | Use                                            |
| ----------------------- | -------------------------: | ---------------------------------------------- |
| SAM 3 Tracker           |                947,233,609 | Previous default; not rerun in this comparison |
| EdgeTAM FP16            |                 20,590,968 | Evaluated candidate                            |
| SAM 2.1 Hiera Tiny FP16 |                 78,004,244 | Selected default                               |

The selected weights are about 12.1 times smaller than the previous default.
EdgeTAM is another 3.8 times smaller than Tiny, but that did not translate into
lower repeated-prompt latency in the measured workload. The earlier three-point
exploration also favored Tiny for the two repeated points; it is retained
separately and does not contribute to the table below.

The input contract matters: both candidates stretch RGB to 1024 × 1024 without
padding, normalize with ImageNet mean/deviation, and accept int64 point labels.
Replacing the model ID while retaining SAM 3's 1008-square/0.5 normalization would
be incorrect. Both exports retain three image embeddings on GPU and use the
same point/box adapter, highest-IoU selection, full-source reconstruction and
worker PNG encoder. Public model cache/lock identities and portable masks remain
compatible. Old SAM 3/EdgeTAM entries remain removable, but cannot satisfy the new
model's ready state. Existing generated masks are unchanged.

Sources: the pinned [EdgeTAM export](https://huggingface.co/onnx-community/EdgeTAM-ONNX/tree/9c77c7bff7fd0f3079585fa17af7f730ddc531ed),
[pinned SAM 2.1 Tiny export](https://huggingface.co/onnx-community/sam2.1-hiera-tiny-ONNX/tree/814a066640debee5a91e70aa401fb8e17e030503)
and [Meta model card](https://huggingface.co/facebook/sam2.1-hiera-tiny).
Weights are separately downloaded, checked against pinned byte lengths/SHA-256,
and covered by the upstream Apache-2.0 notice.

## Frozen executables and environment

`artifacts/refinement-models/{edge,tiny}/dist/` contains minified production ESM
predictors and matching source maps. The comparison changes only the pinned
manifest between builds; preprocessing, inference and mask encoding are shared.
The build configuration, downloaded verified graphs/weights, captured upstream
processor configurations, graph input/output inspection, commands, raw JSON,
logs and mask PNGs are retained under `artifacts/refinement-models/`.

Chrome for Testing 156.0.8078.4, headless full Chromium binary, Linux, Intel
`xe-lpg`, fallback adapter false. Each cohort runs serially with CPU quota 200%,
MemoryHigh 2600 MiB, MemoryMax 3200 MiB, swap disabled, Node heap 768 MiB and
nice 15. The OS/driver shader cache and unrelated activity on this shared
workstation are uncontrolled; these observations are not causal per-event
subtractions or physical display timestamps.

Weights are primed from the verified local copies into a fresh browser's normal
CacheStorage before session timing. The production downloader still reads and
verifies their exact SHA-256. Thus initialization includes cache reads/hash checks
and native ORT session creation, but excludes WAN transfer. Download-size savings
are known; no WAN download-speed or VRAM-size claim is inferred from them.

## Workload and measured boundaries

The existing `scripts/verify-segmentation.ts` runs the genuine production module
in a dedicated module worker, using the official Transformers.js documentation
Corgi image, 614 × 410. Each candidate has two worker runs: ten foreground points
(one first image plus nine warm corrections), two include/exclude prompts, and two
rectangles. The second worker repeats with remote networking blocked to verify
cache reuse. Tiny runs before EdgeTAM in this final cohort. All observations are
retained, including first calls and slow warm samples.

A mask duration includes the awaited prediction (and first image encoding when
needed), full-resolution CPU mask reconstruction/validation and native PNG
encoding. It ends at an encoded worker result, not an actual editor canvas paint.
Initialization and first-image calculation are separate. Model outputs must be
finite, nonempty and not fully opaque. Inclusion/exclusion and rectangle results
must retain the subject pixel and exclude a background pixel. PNGs were visually
inspected; this single image does not establish hair/fine-edge quality generally.

| Candidate | Session initialization, two workers (ms) | First image mask, two workers (ms) | Warm point median (ms, n=18) | Warm point p95 (ms) |
| --------- | ---------------------------------------: | ---------------------------------: | ---------------------------: | ------------------: |
| edge      |                          4296.1 / 4408.3 |                    1400.2 / 1453.9 |                         83.0 |               181.9 |
| tiny      |                          2707.6 / 2721.3 |                    1611.0 / 1501.2 |                         44.8 |               102.8 |

The first use still takes seconds to initialize the runtime and encode an image.
Subsequent corrections reuse its GPU embeddings. This change removes the giant
SAM 3 download; it does not promise instant first inference or zero CPU work.
ORT reports that some shape operations are deliberately assigned to CPU, while
WebGPU is the requested inference provider; source preparation and PNG encoding
are also native CPU work.

A separate final-default verification observed 744 actual GPUQueue submissions
and checks that one encoder run supplies all fourteen prompts, with GPU-buffer
embeddings. It preserves independent console warnings in its report rather than
silently presenting them as absent.

A trusted native-button probe observes input timestamp → next RAF during the model
work, on an isolated validation page. Its raw distributions are retained. It is
not a full Studio Starter frame-rate or responsiveness benchmark: the editor's
3D renderer shares the physical GPU with inference, and this page has no editor
render workload.

## Gestures, transactions and cleanup

The selected model does not introduce a point/rectangle menu. The existing surface
infers a point at ≤4 px movement and a rectangle from a longer primary drag.
Right-click/Alt-click supplies an exclusion label; an existing rectangle remains
part of the prompt. Refinement consumes the secondary pointer/context menu before
normal Studio panning can act. The same ToolSettings card is now mounted in Studio,
which previously exposed the command through search/shortcuts without showing its
Refine/Apply controls.

Focused native tests verify automatic point/rectangle inference, secondary
exclusion, unchanged selection/document/view, native context-menu suppression,
mask recovery, decoded exports and single-step undo/redo. Their deterministic
worker fixture establishes interaction/transaction behavior; the separate real
model cohort establishes inference and actual encoded masks. Unit tests cover
normalization, GPU embedding retention, session/tensor cleanup, failures, verified
cache reads/removal and legacy namespace recognition. Cancellation terminates the
worker; successful verification explicitly releases its model sessions.

The initial optional Tiny README download returned 404 after all graphs/weights
had downloaded and verified. One EdgeTAM attempt also failed because the local
verification server had stopped; that failure is retained as
`edge/unavailable-server.json` and contributes no model timing sample. The first
Studio gesture experiment revealed the missing shared card; it was fixed and
rerun instead of increasing the timeout.
