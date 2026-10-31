# On-demand GPU pass timings

The composition Performance footer already enables Three's timestamp queries
while sampling twelve real poses. It now records the render UIDs passed through
Three's instance-local Inspector hook, then obtains each resolved duration through
the same backend. It preserves the previous inspector and restores its own hook
and timestamp flag when the measurement closes or is canceled.

Render scenes carry diagnostic names for video rasterization, masks, composition,
shapes, text, vectors, morph geometry, 3D, color conversion and the final display.
Effects retain their actual shader-stage keys, such as `ascii`, `dither`,
`blur:x` and `blur:y`. Equal stage names sum within each sampled pose; this is
stage attribution, not per-layer attribution. The GPU accordion displays these
rows using the existing localized performance UI.

The total is the sum of resolved captured render-pass durations for that pose.
Three's `resolveTimestampsAsync("render")` return value alone can describe only
its last internal frame, so it is no longer used as the whole composition cost.
Rows and the total each report their own p95 over measured samples. Do not add
row p95 values to reconstruct the total p95.

## Bounds and interpretation

- No measurement hook, polling or timestamp readback is enabled during ordinary
  playback. Only explicit profiling maps Three's timing metadata. It never reads
  rendered texture pixels into JavaScript.
- At most one timestamp resolution is pending. A sample admits at most 512 render
  UIDs and 64 distinct stage labels. Missing, invalid, duplicate or overflowing
  query data makes the total unavailable rather than presenting a partial zero.
- A missing stage in an otherwise complete measured pose contributes zero for
  that pose. An unsupported backend or failed resolution contributes no GPU
  measurement; CPU wall time is never substituted for GPU time.
- Timings cover captured render passes. They do not include native video decode,
  texture transfer operations outside those passes, standalone clears, queue
  waiting, browser compositing or physical display latency. The final display
  pass includes the canvas scene drawn by the shared R3F renderer.
- CPU source/text/composition fields remain wall intervals and can include async
  waiting. They are different from GPU timestamps. The profiler samples
  increasing exact poses with the existing bounded sequential video cursor, so it
  does not repeatedly reopen random-access decoders. It never starts audible
  playback. Proxy selection, cache state and diagnostic seeks can still differ
  from ordinary playback.

## Verification

Focused tests check stage aggregation, whole-total correctness, unsupported and
missing data, invalid values, bounded overflow, inspector ownership, cancellation
and stale query results. Native Chrome checks the actual Morph canvas and a small native video/effects/
mask/display witness. The latter checks timestamps and cleanup, not pixel quality
or 1080p throughput. The existing readback probe distinguishes
allowed timestamp buffers from prohibited production pixel reads. These are
functional diagnostics against the development server, not a frozen-build
frame-rate benchmark; follow [the cohort protocol](protocol.md) for comparisons.

The additional full Bloom Windows probe hit the existing eight-second profiler
limit during a shared-workstation memory-pressure run. Its last captured video
upload acknowledgement alone took about 3.97 seconds; this is wall waiting, not
GPU execution time. A subsequent run was interrupted when memory pressure rose.
This is not a passing full-composition performance result. The failed capture and
probe remain in ignored `artifacts/bloom-trace-205453/`; the independent small
WebGPU witness passed in Chrome 156.0.8078.79 with one CPU core and a 1400 MiB
memory cap, and recorded zero pixel/frame readbacks. No adapter identity was
recorded for that functional witness. A full healthy-machine cohort remains
necessary before claiming a Bloom frame-rate improvement.

## Budget presentation and copying

The Performance icon starts a fresh measurement when its popover opens. The
normal FPS select changes only the comparison budget, not the sampled document or
another profiling job. The shared CopyButton copies a JSON snapshot with the
selected FPS and budget. Cached results stay hidden while a fresh request is
pending, and closing still cancels pending work.

The popover omits zero/unavailable metrics and empty domains. It uses the same
linked contribution chart/legend as Project storage, now a unit-independent shared
component. CPU and GPU keep independent budgets. Their breakdowns use a single
p95-ranked pose for that clock, so each breakdown adds to its displayed total;
independent per-stage p95 rows are never added together. CPU host elapsed includes
awaited work and scheduling inside its measured boundary. Unknown/overlapping
stages fall back to one host-elapsed contribution. A budget marker, over-budget
amount and highlighted individually excessive contributions expose the dominant
cost without attributing GPU time to CPU utilization.

The focused native UI check uses a small real-rendered rectangle Motion scene to
verify selection, clipboard output, fresh reopening and horizontal bounds. It is
separate from the heavier Morph/Bloom diagnostic workloads and does not claim
those workloads meet their frame budget.
