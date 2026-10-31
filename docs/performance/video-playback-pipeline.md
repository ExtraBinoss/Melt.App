# Video playback pipeline diagnostics

Development builds log `[Melt pipeline]` for editor canvases and library previews.
Production does not instantiate the logger or its observer. There is no repeating
interval, GPU timestamp query or JavaScript pixel readback in the automatic logger.

The first completed preparation is reported separately. Active playback then emits
one bounded summary per two-second window, including project identity, composition,
slowest pose, frame/preparation percentiles, source/upload counters, native decoded
formats, decoded memory, cache usage and render-pass deltas. Pause and owner changes
reset the window; disposal disconnects the observer. At most 256 samples per metric
are retained. Canvas diagnostic DOM snapshots are separately limited to four writes
per second with one trailing publication, rather than serializing profile arrays
multiple times per rendered frame.

Read the boundaries precisely:

- `completedPreparationsPerSecond` counts completed graph preparations, not monitor FPS.
- `drawIntervalMs` measures time between recorded preparations, including scheduling.
- `decodeWaitSumMs` sums asynchronous decoder waits; it is not isolated CPU work.
- `gpuQueueWaitMs` measures queue acknowledgment wall time, not individual shader time.
- `compose` includes CPU submission and queue waits. Use the explicit performance
  profiler's GPU timestamps to isolate passes when the adapter supports them.
- A source timestamp advancing normally does not prove the final GPU image is correct.

The real eight-original workload, media provenance, bounded runner and comparison
procedure are in [the native video witness](../../test/performance/video-playback/README.md).
A development-only `videoProxy=0` editor query forces original-resolution decoding
for this investigation. Production keeps the normal proxy policy. A proxy-disabled
1080p stress run is not comparable to a small hover preview without labeling it.

## Memory finding

At eight independent 1080p streams, retaining two past decoded frames per cursor
can exhaust the unchanged aggregate 384 MiB decoded-frame budget. Playback now
keeps two cached frames for up to four independent source-time streams, and one
above four. Existing cursors shrink before additional streams are admitted. The
bounded Mediabunny decoder queue and borrowed frames remain accounted separately.
Synchronized aliases share a decoder and GPU upload; they do not consume independent
stream slots. More than eight independent source-time streams still fail admission.
This addresses a measured memory failure, not a claim that eight original H.264
streams plus effects render at 60 FPS on every machine.

## Native cohort: October 31, 2026

Google Chrome 156, headed, default GPU flags (`--no-sandbox` only), Linux,
1280 × 800 viewport, native H.264 support. Chrome reports Intel Arc (MTL) through
ANGLE/OpenGL, WebGPU enabled and Vulkan/OpenGL interop enabled. This does not
establish which native H.264 decoder implementation the browser selected. The
process tree was limited to 400% CPU, 2,800 MiB soft / 3,800 MiB hard memory,
no swap. There was no concurrent test browser. The frozen bundles compare only
the media source/cursor owners; all other render code is shared within this cohort.

| Workload                               | Before                             | Adaptive decoded history |
| -------------------------------------- | ---------------------------------- | ------------------------ |
| Four raw originals, warm p50 / p95     | 19.9 / 32.2 ms                     | 20.2 / 35.4 ms           |
| Eight raw originals                    | Decoded budget exhausted           | 36.2 / 53.8 ms           |
| Eight originals + effects/masks/motion | Decoded budget exhausted           | 66.2 / 111.5 ms          |
| Timed four-to-eight handoff            | Decoded budget exhausted           | 42.1 / 79.3 ms           |
| Twelve independent streams             | Admission rejected before decoding | Same bounded rejection   |

Each successful row contains 45 preparations with the first twelve excluded from
warm percentiles; this is a diagnostic cohort, not a statistically strong release
benchmark. The staged row includes the density transition and should not be compared
as a constant-eight workload. Eight-stream accounted decoded memory settled at
331,776,000 bytes and peaked at 398,131,200 bytes under the unchanged 402,653,184-byte
limit. Native frame and decoder handles returned to zero after every scenario;
no double closes or JavaScript GPU/WebGL/canvas/VideoFrame readbacks occurred.
The four-stream difference is too small to claim an improvement or regression from
this single cohort. The eight-stream motion p95 remains far above a 60 Hz frame budget.

A separate native gallery screencast reproduced black video frames with default
Chrome GPU settings. No source gaps, PTS rollback, external-image copy exception or
uncaptured GPU error was recorded around them. Forcing opaque alpha and retaining
extra native source references did not eliminate the flashes; neither experiment is
included in production. This remains an open GPU image-correctness issue, separate
from the corrected memory failure.

Ignored evidence: `artifacts/video-stress/adaptive-final/` (frozen code, native
captures, environment and report), `bloom-upload-probe/` and `bloom-retain-probe/`
(screencasts plus source lineage). These files are intentionally not Git assets.

A diagnostic native `createImageBitmap(VideoFrame)` upload experiment recorded no
black captures in 178 screencast samples across 26.5 seconds, compared with seven
black samples among 114 in the direct-upload reproduction. Independent diagnostic
source-pixel inspection showed valid decoded content around bad output frames.
The native-copy experiment is not yet a production change. Chromium supports
both accelerated and software bitmap construction, so an ImageBitmap API call
alone does not establish GPU residency or absence of internal browser readbacks.
See the [Chromium video-frame implementation](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webcodecs/video_frame.cc).

## No-readback constraint and rejected upload experiments

Inspection of Chromium's native implementation revealed two important limits:

- `premultiplyAlpha: "none"` can select the CPU pixmap/readPixels transformation.
- On Linux, `CopyStaticImageBitmapToWGPUTexture` explicitly forces an accelerated
  bitmap through `MakeUnaccelerated()` before uploading. Thus zero **JavaScript**
  read API calls do not prove zero **internal browser** GPU readbacks.

Sources: [bitmap transforms](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/graphics/static_bitmap_image_transform.cc)
and [external-image uploads](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webgpu/external_image_utils.cc).
Both direct ImageBitmap experiments were rejected; the committed rendering path
continues to upload native VideoFrames without an added bitmap or software canvas.

Additional bounded default-Chrome probes further narrowed the issue:

| Diagnostic variant                                               | Captured frames | Black captures |
| ---------------------------------------------------------------- | --------------: | -------------: |
| Existing WebGPU VideoFrame upload                                |             114 |              7 |
| Native bitmap converted back into a shared-image RGBX VideoFrame |             121 |              9 |
| Prefer hardware decoder (observed NV12 rather than I420)         |             120 |              5 |
| Request core adapter rather than compatibility adapter           |             122 |              6 |
| Three WebGPURenderer with its WebGL backend                      |             154 |              0 |

These are separate diagnostic sequences, not synchronized pixel-by-pixel cohorts.
The WebGL sample's last warm two-second window recorded 57.6 preparations/s with
9.3 ms median / 17.8 ms p95 preparation time. This suggests a GPU-backend-specific
problem rather than missing or incorrectly timed decoded source frames, but does
not establish the exact upstream fault. No automatic browser/GPU blocklist or
renderer switch was shipped from this one-machine result. The more stable WebGL
path remains a candidate for a measured compatibility workaround.
