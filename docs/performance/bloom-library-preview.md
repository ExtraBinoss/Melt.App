# Bloom library preview investigation

The supplied `Trace-20261031T224841.json` covers approximately 25 seconds of the
Templates page. Chrome reports 138 dropped compositor frames. These are browser
frame events, not a count of Melt composition frames. Many cluster during cold
startup: a 435 ms task loads/initializes rendering, followed by 168 ms and 383 ms
font/text preparation tasks. Those cold costs remain optimization targets.

The library imposed a separate 30 fps grid on a 60 fps animated composition.
It now uses the editor's shared continuous microsecond phase and half-open loop
rule. Source video remains sampled at its native PTS; animation does not require
an extra video decode for every pose. Preview raster density now fits its actual
host within the existing 480 px upper bound. Effects retain authored reference
coordinates rather than changing appearance to reduce work.

A native Chrome 156/Linux diagnostic compared 38 explicit 60 Hz poses, discarding
the first ten for warm summaries. It used the existing Three/Mediabunny graph,
real Three GPU timestamp queries, a 480 px output, one browser, a one-core CPU
quota, 1.5/2 GB memory high/max limits and no swap. These development-server,
CPU-capped diagnostics are **not production latency or physical-display claims**.

| Workload | Host frame p50 / p95 | GPU passes p50 / p95 |
| --- | --- | --- |
| Raw preview video only | 2.85 / 8.70 ms | 0.12 / 0.17 ms |
| Full composition, preview original | 16.65 / 54.30 ms | 0.97 / 1.11 ms |
| Full composition, 1080p original | 20.40 / 58.70 ms | 1.24 / 1.89 ms |

Warm preview source preparation was 0.7 / 3.1 ms p50/p95; composition including
submission and GPU acknowledgement was 15.15 / 50.1 ms. GPU shader execution
alone does not account for that host wall time. CPU submission, native scheduling
and queue waits need separate measurements on the affected browser. Do not label
host wall time as GPU execution time or claim decoding is the sole bottleneck.

Each full-composition run used one sequential decoder and 19 uploads for 38 poses,
with 133 GPU source reuses across synchronized copies. Preview GPU accounting
was about 30.4 MB; the full original used 46.0 MB. This short run does not show a
need to raise cache limits or add more decoders.

The real gallery hover regression verifies one complete 12-second source loop,
PTS coverage without unexpected rollback/gaps, one initial cursor and one loop
restart, host-sized output, release on pointer leave and zero production pixel
readbacks. It does **not** establish that the user's intermittent bright flashes
are fixed. Submission intervals remain irregular in the capped diagnostic.
The source asset itself intentionally blooms forward for six seconds and then
reverses for six; its presentation timestamps still advance monotonically.

Ignored evidence lives under `artifacts/bloom-trace-224841/` and
`artifacts/template-video-playback/`. Development hover lineage now records video
PTS, GPU-ready completion and canvas submissions for a future affected trace.
