# Interactive video sources and proxies

`MediaVideoSources` owns original resolution, optional presentation variants, decoded budgets and GPU uploads. Portable projects retain the original `VideoAsset`; proxy metadata and encoded bytes never enter the document, history, asset store or original resolver. The interactive canvas opts in through `RenderOptions.videoProxy`. Headless callers may provide the same activity contract and profile without depending on React or browser editor state. Exact rendering always ignores proxies. Audio and export continue resolving originals.

## Conversion policy

The session-local `VideoProxyCache` queues original identities (`originalId` plus `contentRevision`) and runs one reusable native worker. The immutable profile controls longest edge, bitrate, keyframe interval, per-result bytes, aggregate cached bytes and entry count. Defaults are 960 pixels, 1.2 Mbit/s, one-second GOP, 16 MiB per result, 64 MiB ready bytes and eight identities. Profile changes invalidate previous results and retire the old worker. Deletion, resolver retirement and disposal reject late work; failed conversions are recorded in source statistics and retain original playback without an automatic retry loop. Long sources that exceed the configured encoded-byte limit fall back to originals.

Mediabunny `Conversion` resizes through its native video path, bakes orientation, discards the proxy audio track and preserves original cadence, including VFR. There is no forced frame-rate conversion or forced hardware decoder preference. AVC is preferred when the browser encoder supports it, with VP8 fallback. A bounded `StreamTarget` rejects out-of-budget writes before accepting them. Output metadata and duration are validated before admission. Source/proxy first-PTS differences are translated at the request/lease boundary; authored timing stays unchanged.

The canvas activity adapter opens conversion after 180 ms of quiet time and closes it during pointer gestures, native dragging, wheel/key input, hidden tabs, playback and noncanonical previews. `Conversion.execute({pauseSignal})` cooperatively suspends an active conversion, retaining its encoded prefix; the same conversion resumes when idle. Explicit retirement terminates the worker. No idle RAF loop or periodic polling is installed. Completed proxies request an imperative canvas refresh. Playback keeps its initial source object until pause/preview, including through ready-cache eviction, avoiding mid-play decoder/profile switches. These active blobs follow the bounded stream lifetime separately from the ready-cache byte limit.

## Resource ownership

At most eight active original identities/playback streams/upload rings are admitted. Each source retains the existing 96 MiB local decoded limit, but all sources/cursors additionally share one 384 MiB decoded budget. It includes cached/borrowed frames and the existing four-frame decoder reservation; codec-private browser surfaces remain additional native overhead. GPU upload textures and retained layer targets remain charged to the existing GPU cache, independently of decoded-memory accounting. Playback opens its sequential cursor directly without a duplicate poster decoder. A variant switch fences the prior composition and retires old-size upload rings before allocating replacements. Native leases remain owned until actual GPU acknowledgements.

This is bounded resource admission, not a guarantee that eight arbitrary 4K clips can play concurrently. Until preparation finishes, previews use originals; codec support, duration, source complexity and available memory still matter. Proxies are rebuilt per session and are not a persistent disk cache.

## Shared frames and sequential export

Copies that request the same immutable original, orientation, dimensions and exact
source timestamp borrow one GPU texture pinned for the current render. Their
masks/effects remain independent. The per-render sharing map is discarded before
the next frame; changed trims, source metadata, proxy revisions and genuine gaps
cannot inherit a different sample. Removing an owner retires its cursor/upload
ring through the existing acknowledgement path. This reduces synchronized copies
to one decode/upload without creating a second video processing pipeline.

Hover previews use sequential playback and can use a separately validated raw
video derivative bundled with a template. Full and preview manifests occupy
separate bounded cache keys; normal project installation always resolves the full
original. These derivatives contain no baked effects or rendered composition.

A forward request more than one second beyond a cursor's previous request recreates
that cursor near the requested time, as do reverse/loop seeks. This bounds stale
stream catch-up after delayed input without choosing a future frame or hiding
real VFR gaps. Ordinary small forward steps retain the decoder.

Motion video export sets `RenderOptions.mediaSequential` while keeping
`mediaMode: "exact"`. It reuses the bounded forward cursor over original bytes,
retains exact timestamp selection and still awaits GPU upload fences before
encoding. Interactive playback presents through the same ordered Three.js GPU
queue without a per-frame upload wait; upload rings keep native leases until
actual acknowledgement and remain bounded during cancellation/disposal.

## Mediabunny references

The implementation follows the pinned 1.62.1 API and its official [conversion guide](https://mediabunny.dev/guide/converting-media-files), [conversion video options](https://mediabunny.dev/api/ConversionVideoOptions), [media sinks](https://mediabunny.dev/guide/media-sinks) and [VideoSampleSink API](https://mediabunny.dev/api/VideoSampleSink). Playback already used sequential `samples(start)` with latency optimization; the new work keeps that path and reduces the resolution entering it. See [the five-video measurements](../performance/video-preview.md) for native verification and limitations.

## Infinite-canvas buffering

The canvas adapter acquires a transport buffering lease when submitting a playing
frame and releases it only after Three draws the corresponding display scene.
Coalesced requests share one lease. Up to 33.3 ms of preparation counts toward
normal playback; longer decode/compilation waits do not accumulate catch-up time.
Paused seeks, errors and disposal release the lease as well. This is presentation
backpressure, not a change to the portable document, source speed or exact export.

## Opaque packed RGB frames

Hardware/proxy decoding may produce BGRX or RGBX instead of I420. Their X byte
is padding, not alpha. Preserve the encoded RGB bytes with Three's premultiplied
upload setting and write coverage 1 in the existing TSL raster pass for these two
formats only. This avoids unpremultiplication against undefined padding as well
as accidental transparent frames. Actual-alpha and YUV formats keep their own
settings. Reusing a slot across format changes refreshes that setting every time;
leases, upload rings, texture budgets and acknowledgements remain unchanged.
Native backend regressions check arbitrary padding and retained real alpha.
