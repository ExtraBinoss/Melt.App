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

## Minimal reproduction and GPU-preserving display workaround (November 1)

A minimal Three.js test also reproduces black captures without Mediabunny, MP4
parsing, WebCodecs decoding, a Motion timeline or the document compositor. It
constructs native I420 VideoFrames from known nonblack bytes and renders them
through a VideoFrameTexture. Direct rendering produced five black captures among
94; the production video rasterizer plus presentation produced three among 96.
This rules out demuxing/decoding as a necessary trigger, but does not by itself
identify whether Three, Chromium, the driver or native presentation is responsible.
A flipY change initially passed the minimal case but still failed the full Bloom
composition, so it was also rejected rather than shipped as a fix.

An X11 launch recorded zero black captures among 133, but checking the actual
upload calls and adapter selection invalidated the initial interpretation:
WebGPU accepted no VideoFrame uploads and Three had selected its WebGL backend.
Direct X11 adapter probes returned null. This is evidence for the WebGL
compatibility path, **not** a verified X11 fix for hardware WebGPU. Earlier claims
that WebGPU remained active in that test were incorrect. A standalone browser's
global feature-status table is insufficient to identify the renderer actually used.
The isolated CLI editor was closed after it failed to reach a visible canvas;
no change was made to the user's daily Chrome or Firefox profiles.

Related primary reports:

- [Three #32391](https://github.com/mrdoob/three.js/issues/32391) and its
  [#32441 workaround](https://github.com/mrdoob/three.js/pull/32441): bad video
  uploads can break a WebGPU pipeline. That exception guard is already present
  in the installed Three version; our reproduced black frames raise no such error.
- [Chromium #548711898](https://issues.chromium.org/issues/548711898): native
  Wayland black video with an X11 workaround. Its reported NVIDIA/DRM environment
  differs from this Intel/unprotected-I420 reproduction, so it is supporting
  platform evidence rather than an identification of the same underlying bug.
- [MasterSelects video texture paths](https://www.masterselects.com/docs/features/gpu-engine/)
  documents browser-specific black imported video textures and persistent-copy
  workarounds. Its separate Linux software-presentation/readback fallback does
  not meet Melt's no-readback constraint and was not adopted.

Ignored reproduction/capture evidence: `artifacts/video-stress/minimal/` and
`artifacts/video-stress/bloom-x11-inspect/`. No experimental native-copy, decoder
preference, UV-flip or automatic backend-switch code remains in production.

## Automatic backend policy

Video compositions keep WebGPU when native VideoFrame import is supported. A
cached, one-time capability probe uploads a synthetic 2×2 native frame, checks the
validation scope and GPU queue completion, then destroys its frame, texture and
probe device. It runs before binding the editor canvas, so fallback never tries to
rebind a WebGPU canvas to WebGL. It performs no GPU pixel readback. Unsupported
imports select Three's WebGL 2 backend via `WebGPURenderer({ forceWebGL: true })`.

Desktop Linux Chromium video surfaces use WebGL conservatively. A narrower
Chrome-156/Intel-xe-lpg criterion passed the isolated native check but did not cover
the user's live Chrome failure. Validation cannot detect black pixels without
readback, so successful upload admission alone cannot certify pixel correctness.
Other operating systems retain WebGPU when the native operation succeeds. Firefox
uses the capability probe rather than a permanent browser-version blocklist, so a
future implementation with native import support can retain WebGPU.
Nonvideo documents do not run the video probe. Canonical authored tracks are
checked before the first pose, including videos starting later in the composition.
Audio-only documents do not select the video policy.

The editor subscribes to a video-presence boolean. Playback/property-preview ticks
do not rerender its root; adding the first video or removing the last one remounts
the canvas and retires the old owner. Reusable standalone sessions choose the
backend inside their exclusive frame queue, release previous compositor,
presentation and renderer resources before changing backend, and include retained
video originals when a materialized pose hides an inactive video. Canonical
preview/export callers provide their stable composition choice explicitly.
An explicit `forceWebGL: false` remains available for controlled WebGPU diagnostics.

This does not replace Mediabunny, alter clocks or force software decoding. Source
frames still use the existing native VideoFrame texture owner and GPU effects/masks.
No native bitmap intermediate, software canvas, pixel array or GPU readback was
added to rendering. Native encoding and test-only pixel inspection keep their
existing roles.

Firefox additionally documents unsupported WebGPU VideoFrame uploads in
[Mozilla #1922100](https://bugzilla.mozilla.org/show_bug.cgi?id=1922100), while
[WebGL VideoFrame uploads were implemented in Firefox 119](https://bugzilla.mozilla.org/show_bug.cgi?id=1781526).
Selecting the supported Three backend avoids treating an initialized GPU session
as proof that every video-source import operation is supported.

## Library playback controls

The Open in Melt preview imports the same `MediaPlayer` used by export, placed
at the bottom of the artwork with the shared translucent, blurred overlay style.
Hover cards show a compact purple progress strip between their artwork and caption. Both consume
accepted preview-frame positions, not a second extrapolated clock. Frame position
updates are imperative; only readiness, duration and play/pause update the control
component. Seeks share the renderer's bounded latest-request queue, cancel stale
admission and render while paused without starting a background playback loop.
The player can select the inclusive endpoint; Motion evaluates the last valid
subframe at its exclusive composition boundary.

## Copyable environment diagnostics

The on-demand Performance report includes the browser user agent/version, reported
OS/platform, logical processor count and browser-reported memory when available,
viewport/screen/DPR, language, motion preference, security context and native media
API availability. Renderer details come from the existing canvas owner: selected
backend, Three revision, canvas density/color space, GPU vendor/description and
exposed architecture/features/limits. WebGL uses ordinary capability queries and
the optional debug-renderer extension; WebGPU uses the active device metadata.
No second adapter/context or pixel readback is created for this report. Unexposed
fields are omitted, and the bounded snapshot freezes these values with its sampled
metrics so the copied report describes the measured renderer.
