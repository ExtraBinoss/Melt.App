# Deterministic replay and video encoding

Verified against unmodified Mediabunny 1.65.0 on 2026-11-01.

Committed command transactions form a millisecond journal. Pointer previews and selection changes do not enter it. Portable replay data keeps original assets once, outside frame snapshots. Playback evaluates the journal without modifying the live document or undo history.

New deltas omit optional fields that are undefined on both sides. Version 1
journals may contain redundant removals of an already absent optional object
field; replay accepts those terminal removals. Missing parents, array indices
and move sources still fail validation. Direct delta application remains strict.
The preview caches the final page once per prepared journal, so seeking does
not replay the entire journal merely to recompute its final crop.

Video export evaluates a fixed number of frames at explicit timestamps. A retained Three.js WebGPURenderer session serializes each render and its asynchronous encoder consumer. Mediabunny's `CanvasSource` captures that GPU canvas through the browser's native media pipeline. No application pixel array, Canvas2D copy, screen capture, or GPU readback is involved. Awaiting every `add()` propagates encoder backpressure and bounds pending frames.

The encoder probes actual codec support for the selected resolution. MP4 uses AVC; automatic output can choose WebM with VP9 or VP8. Explicit MP4 requests fail visibly when unavailable. Cancellation closes the output and renderer. Video dimensions stay fixed throughout recorded page resizing.

On 2026-11-01, the native `timelapse-recovery` witness loaded an actual persisted
legacy journal into the editor, displayed its preview and exported an MP4.
Independent decoding verified 30 frames at 96 × 64 over one second. The small
preview became ready in 761 ms; this is a functional witness, not a general
latency benchmark. A missing intermediate replay path then produced visible,
copyable preview and export errors and console diagnostics. Production pixel
readback probes remained zero. Captures are in `artifacts/timelapse-recovery/`.

Primary references: [media sources](https://mediabunny.dev/guide/media-sources), [writing files](https://mediabunny.dev/guide/writing-media-files), [samples and packets](https://mediabunny.dev/guide/packets-and-samples).
