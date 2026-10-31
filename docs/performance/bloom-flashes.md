# Bloom Windows: remaining playback flashes

## Supplied trace

`Trace-20261031T202351.json`, recorded in development on 2026-10-31, contains
397,748 events and 450 screenshots at DPR 1.25. Fifteen captures show the video
artwork absent while the authored dark-green background and labels remain. Six
episodes occur at approximately 6.197, 6.634, 8.028, 9.975, 11.107 and 11.372
seconds from the first screenshot. This observation is more specific than an
entire blank framebuffer, but does not identify the failing source/texture stage.

The visible counter moves from 7.058 seconds at trace time 3.250 to 10.018 seconds
at 6.651: 2.960 seconds of authored time in 3.401 seconds of captured wall time.
That interval does not demonstrate accelerated transport. The authored orbit is
one turn per 1.2 seconds; the original footage is a timelapse. This single counter
interval cannot prove that every decoded sample and displayed texture stays in
sync.

## Reproduction limits

Serial native Chrome 156 tests, with bounded CPU/memory and an Intel Xe-LPG
WebGPU adapter, verified irregular original decoding across the loop and a native
960 × 540 proxy. Neither produced missing frames. A proxy converted across 63
real pause/resume boundaries also decoded without missing samples.

Two native complete-composition sequences each sampled 360 irregular timestamps
starting at 7.023 seconds and crossing the loop. Both the bundled 480p derivative
and the full 1080p original kept the inspected background-source pixel visible,
with 186 uploads and 1,254 shared/reused samples per sequence. These harnesses
used validation-only pixel reads; production rendering still performs none.

Live editor captures at DPR 1.25 did not reproduce the supplied flashes. Their
capture overhead and bounded process cadence differ from the supplied recording,
so they do not invalidate it or establish that the defect is fixed. Evidence and
scripts remain in ignored `artifacts/bloom-trace/`. The original trace is retained
in the user's Downloads directory.

## Development frame lineage

Development canvas Motion requests now emit three User Timing marks:

- `Melt frame: video`: source time, decoded PTS/duration, native format, proxy
  selection and texture ID. `action` distinguishes an upload, a retained GPU reuse
  and an actual missing source sample (`gap`). Synchronized copies share that
  texture rather than producing another upload event.
- `Melt frame: gpu-ready`: accepted composition time and output texture for a new
  composite. `gpuAcknowledged` identifies playback's real GPU completion fence;
  nonplaying previews publish through the ordered queue without that wait.
- `Melt frame: display`: the time and texture actually submitted by the display
  scene, after Three's display draw.

A new Chrome Performance recording includes these marks and their structured
`detail`. Comparing them around a screenshot with missing artwork distinguishes
source selection from GPU publication/display. A display callback is not a
physical panel timestamp, and these marks do not inspect texture pixels.

The renderer's `traceFrames` option defaults off. The web canvas enables it only
for development Motion plans (`import.meta.env.DEV`); production does not enable
it. Marks are immediately removed from the runtime entry buffer after recording,
with no retained frame arrays, polling, console logging or GPU pixel readbacks.
They do not enable the more expensive buffered `profileVideo` sample arrays.

## Follow-up trace and native RGB fix

`Trace-20261031T205453.json` includes 893 frame-lineage events: 297 native BGRX
uploads from a proxy, one retained source reuse, 297 accepted composites and 298
display callbacks. There are no missing source samples and no publication/display
texture-time mismatches. Every selected PTS is at or before the requested time,
with a maximum 33.094 ms difference (one 30 fps sample).

The opaque BGRX path was absent from the earlier I420 reproduction. The
[WebCodecs format contract](https://w3c.github.io/webcodecs/#dom-videopixelformat-bgrx)
defines its fourth component as padding, with fully opaque coverage. A native
WebGPU witness reproduced the defect with arbitrary padding: bytes `[30, 80, 180,
0]` produced red RGB with alpha zero; padding 127 instead unpremultiplied and
brightened those same colors. This explains both missing artwork and brightness
flashes without a decoder gap.

For BGRX/RGBX only, video uploads now preserve stored RGB through Three's
`premultiplyAlpha` copy setting, then TSL writes opaque output coverage. RGBA,
BGRA and YUV paths retain their existing behavior. The same pooled texture and
native frame lease remain in use; this adds no image conversion, decoded frame,
GPU target, production pixel readback or extra render pass.

The native regression alternates packed opaque and actual-alpha formats through
one upload slot, testing padding 0, 1, 127 and 255 on both WebGPU and WebGL. All
opaque samples retain their exact RGB and alpha 255, and actual alpha remains
unchanged. Both backend checks and nine focused ownership/upload checks pass.

In the supplied playing interval, display callbacks are separated by a median
52.748 ms, p95 84.393 ms and maximum 277.134 ms. Source-selection-to-accepted-GPU
publication has median 14.988 ms, p95 36.658 ms and maximum 241.636 ms; these are
wall intervals including CPU work and queue waits, not GPU timer queries. The
accepted authored time advances 14.473 seconds in 18.337 seconds of wall time
including the loop, rather than running ahead. The remaining scheduling/performance
work is distinct from the corrected pixel-format defect.
