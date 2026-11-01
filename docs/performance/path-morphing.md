# Text and path morph profiling

## Findings and implementation

The shipped Melt Mascot composition (`morphing-type`, 1920 × 1080, six seconds) has four text contours with 67 authored states each. Playback already interpolated their GPU atlas in Three TSL. Warm font shaping was not the Firefox bottleneck: a graphics-only frame awaited `GPUQueue.onSubmittedWorkDone()` before publication. Even the same composition with morph disabled stalled around 80–100 ms, despite a sub-millisecond GPU timestamp duration.

Graphics-only playback now publishes ordered texture submissions without awaiting a CPU completion fence after every frame. A bounded window admits at most eight playback submissions; real native completions release slots and teardown drains them. Under sustained GPU overload admission applies backpressure instead of accumulating unbounded commands. This is a submission boundary, not a physical-display or GPU-completion acknowledgment. Video playback retains its conservative publication fence; its native frame leases and three-slot upload rings still use real GPU acknowledgments. Abort/supersession checks and retained presentation targets remain authoritative. No user-agent exception or raw WebGPU rendering pipeline is introduced. Firefox has a related [queue-completion scheduling issue](https://bugzilla.mozilla.org/show_bug.cgi?id=2008103); the attribution here comes from Melt's controlled fence/no-fence experiment, not from assuming that issue explains every Firefox slowdown.

`@musart/path-morph` is a dependency-free TypeScript package. Core retains winding, hole association and missing-hole collapse. The package supplies compact Float64 arc-length correspondence, exact cyclic alignment with early rejection, interpolation into caller-owned buffers, and cooperative shared-trajectory simplification. No correspondence search, SVG serialization, font shaping or atlas packing happens during warm morph playback.

After correspondence, an index may be removed only if every state places it within 1e-10 normalized units of the **same affine combination** of its retained neighbors. Convex interpolation preserves that error bound between states too. This removes redundant trajectory samples rather than removing authored poses, corners, holes or animation keys. The shipped text falls from 1,024 to 188 prepared edges per pose; its maximum conservative ray band has 29 edges. All 268 per-shape authored states remain. The same adapter also handles authored vector morphs. Static SVG mascot triangulation and the DOM brand mascot keep their existing ownership paths.

Morph edges are linear, so one RGBA texel now holds both endpoints. The TSL adapter reconstructs the midpoint and uses specialized line coverage instead of unnecessary quadratic root solving. Fonts with actual quadratic curves retain their quadratic coverage path. Composition, masks, effects and interpolation stay in Three's GPU graph; there is no production pixel readback, new worker pool, WASM initialization or per-frame document mutation.

## Available diagnostics

The existing composition Performance panel and copied report include:

- Prepared glyphs, shapes, authored states, edges per pose, maximum band occupancy and atlas bytes.
- Session counts of text cache hits, geometry builds, shaping runs, shader compilations, draws and morph uniform updates. SVG geometry builds are also exposed.
- Last font acquisition, shaping, contour generation, atlas preparation and shader compilation host elapsed times. Atlas elapsed time includes cooperative scheduling; separate correspondence, trajectory simplification and packing **CPU work** samples exclude task yields.
- Warm uniform/paint update and draw-submission host timings. These are distinct from the existing `GPU morph`, `GPU text` and `GPU vector` timestamp passes.

Detailed timers are opt-in through the existing render diagnostic flag. Development editor playback enables it and emits bounded two-second `[Melt pipeline]` reports with a `text` section. Production leaves it disabled unless the on-demand Performance panel or explicit `profileVideo=1` diagnostic is active. Each phase retains at most 256 samples. No periodic query runs while the panel is closed; GPU timestamps are metadata, not texture reads.

## Measured development cohorts — 2026-11-01

Baseline: `d678dc5`. Optimized source is the change introducing this document. The source variants and raw JSON/captures are retained locally under ignored `artifacts/video-stress/morph-*`. The engine-only witness used the real manifest, one retained session, 1068 × 601 output (scale 0.55625), DPR 1, viewport 1600 × 1000, six warmup poses, then 120 RAF-paced arbitrary seeks across the six-second composition. GPU timestamp sampling ran separately at 12 poses, outside the steady playback-rate interval.

Native Chrome 156 and Firefox 159 ran serially on Linux, with CPU quota 200%, low priority, bounded process memory and no swap. Chrome's actual adapter reported Intel `xe-lpg`; Firefox withheld adapter identity. Firefox's headless compositor reported SWGL/shared-texture limitations. These engine preparation measurements are not certified physical presentation latency or full-editor INP.

| Engine witness          | Baseline median preparation | Same source without graphics publication fence | Observed headless completions/s, before → after |
| ----------------------- | --------------------------: | ---------------------------------------------: | ----------------------------------------------: |
| Firefox, morph enabled  |                       88 ms |                                           4 ms |                                     11.4 → 35.0 |
| Firefox, morph disabled |                       86 ms |                                           2 ms |                                     12.1 → 38.5 |
| Chrome, morph enabled   |                        7 ms |            2 ms, first optimized shader cohort |                                     58.5 → 59.4 |

Warm text preparation was at or below timer resolution/approximately 1 ms on Firefox. Its baseline GPU timestamp median was 3.49 ms with morph, 0.41 ms without. This isolates CPU/native completion waiting from actual shader duration.

An intermediate GPU timing cohort varied materially: unchanged static clear/copy/display passes became several times slower, and Chrome completed at 47.6 fps. That run is retained and excluded from GPU speedup claims. The final serial cohort recovered the static control to approximately 0.40–0.41 ms on both browsers:

| Final compacted morph with bounded submissions | Preparation p50 | Completed seeks/s | GPU p50, baseline → final | GPU p95, baseline → final |
| ---------------------------------------------- | --------------: | ----------------: | ------------------------: | ------------------------: |
| Chrome 156                                     |          1.9 ms |              60.3 |            3.30 → 1.42 ms |           13.21 → 4.94 ms |
| Firefox 159                                    |            4 ms |              33.5 |            3.49 → 1.35 ms |           13.44 → 4.19 ms |

Firefox reached seven pending submissions within the limit of eight, with one geometry build, shaping run and shader compilation across the warm cohort. A headed Firefox forced-fence diagnostic failed its 60-second deadline and is excluded from timing claims. Native headless rendering does not establish 60 fps in the user's headed Firefox; use the new report to measure that environment. The witness measures completed arbitrary seeks rather than a realtime timeline's clock rate.

### CPU package benchmark

Reproduce with `bun scripts/performance/path-morph.ts`. Optionally install Flubber outside production dependencies and supply its module path:

```sh
npm install --prefix artifacts/morph-competitors --no-save --ignore-scripts --no-audit --no-fund flubber@0.4.2
bun scripts/performance/path-morph.ts artifacts/morph-competitors/node_modules/flubber/build/flubber.min.js
```

Bun 1.4.2 / JavaScriptCore, one-core quota, low priority: four real contours, 256 vertices each, 800 correspondence operations and 40,000 prepared interpolation operations. Warmup and checksums prevent counting setup as playback or unused calculations.

| Operation                                             | Microseconds per contour |
| ----------------------------------------------------- | -----------------------: |
| Previous exhaustive cyclic correspondence             |                   436.48 |
| New exact pruned correspondence                       |                     3.83 |
| Prepared interpolation into a retained Float64 buffer |                     0.81 |
| Flubber 0.4.2 prepared ring interpolation             |                    20.99 |

This workload shows approximately 114× faster correspondence and 26× faster CPU interpolation than Flubber's allocating point-array API. Flubber used `string:false`, `maxSegmentLength:Infinity`, identical 256-vertex input/output counts, and prebuilt interpolators. SVG serialization, parsing, full font shaping and GPU rendering are excluded. These are not Firefox/Chrome JavaScript-engine benchmarks or a universal comparison of different SVG/topology capabilities. Flubber documents its [ring output and sampling controls](https://github.com/veltman/flubber/blob/master/README.md#flubberinterpolatefromshape-toshape--options).

## Correctness and limits

Twenty native Chrome before/after screenshots cover ten unique poses on WebGPU and WebGL, with backward/repeated seeks. At 1068 × 601, at most 21 of 641,868 pixels differ in a capture, with a maximum channel difference of 1/255. This includes both atlas packing and trajectory simplification. It is a bounded fidelity witness, not a proof for every imported SVG.

The native contour witness additionally renders 182 seeks on WebGPU and seven on WebGL, generated editable text, and a vector with an appearing hole. Repeated poses are byte-identical within each backend, geometry uploads stay cached, and actual WebGPU/WebGL/Canvas/VideoFrame JavaScript read APIs report zero pixel reads. Unit regressions cover exhaustive correspondence equivalence, deterministic ties, budgets/alias rejection, affine interpolation, shared-trajectory error, holes, cancellation, cache reuse, compile reuse and bounded profiling buffers.

An existing Bun-bundled browser harness failed before rendering because a lazy GLB dependency imported `basis_transcoder.wasm?url`; the native witness was run through Vite instead, then the maintained bundling harness was updated to leave that unused lazy spatial `?url` dependencies external. The temporary native driver initially checked boolean probe-installation flags as if they were numeric read counts; the corrected numeric-only assertions passed. Neither setup failure is reported as successful verification.

The final native WebGPU/WebGL contour suite passed, including cached preparation assertions and a 180-frame, six-second MP4 export. A separate frozen production build passed the 50-image/100-effect GPU workload, bounded edits, idle, export and persistent recovery in approximately 1.1 minutes. Its development-server attempt was interrupted during export; a frozen build is the appropriate timing source. No full repository coverage or release gate is claimed.
