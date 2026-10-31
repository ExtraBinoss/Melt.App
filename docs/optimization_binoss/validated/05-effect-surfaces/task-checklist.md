# 05-effect-surfaces: implementation and validation checklist

Coordinator status: **validated** (2026-11-01). See final evidence below.

## Agent implementation

- [x] Read contracts and confirm file ownership.
- [x] Implement the required behavior without unrelated changes.
- [x] Warm alternating size workloads stop reallocating scratch/backdrop on every frame.
- [x] Prepare focused regressions for multi-stage effects, different aspect ratios, repeated same-size work and eviction.
- [x] Prove no source/output feedback and unchanged decoded native pixels.
- [x] Charge all retained allocations, handle allocation failures and dispose every target.
- [x] Record changed files, focused test paths, an English changelog bullet and known limitations below.

## Coordinator validation

- [x] Review the full diff against every acceptance criterion.
- [x] Run integrated focused code regressions (one bounded worker).
- [x] Run relevant native browser checks where rendering/interaction changes.
- [x] Run affected static checks, version check and rules check (zero violations before commit).
- [x] Inspect cancellation, cleanup, error paths and undo/redo where relevant.
- [x] Record actual results and fix any findings through the task owner.
- [x] Archive this directory under validated/ only after all required checks pass.

## Historical implementation handoff

Status: **implementation ready; coordinator validation pending**. No tests, builds, typechecks, lint, or browser checks were run by the worker. Owned files were formatted.

Changed paths:

- `packages/render/src/effects/GpuEffects.ts`: replaces resizable singleton surfaces with exact-size pooled scratch/backdrop surfaces; keeps caller-owned output lifetimes; rejects draw feedback; preserves separate sampler identities during compilation. Shader preparation borrows at the real preparation attachment size rather than allocating at the logical layer dimensions. Interrupted shader preparation cannot recreate resources after disposal.
- `packages/render/src/effects/shared/target-pool.ts`: deterministic LRU retention, peak/current byte accounting, allocation-before-use with eviction before creation, partial-creation rollback, and explicit target plus sampled-only texture disposal.
- `packages/render/test/effects/shared/target-pool.test.ts`: alternating sizes, format/filtering, count/byte limits, LRU eviction, oversized working sets, projected allocation peaks, rollback, and cleanup regressions.
- `packages/render/test/effects/GpuEffects-pool.test.ts`: actual pass source/backdrop/target identity checks, fixed logical dimensions across aspect ratios, retained output ownership, tiny preparation attachment accounting (including disabled shaders), and asynchronous disposal.
- `packages/render/test/effects/GpuEffects.test.ts` and `packages/render/test/compositing/effect-resources.test.ts`: update accounting expectations to include retained dimension buckets.
- `test/browser/effect-surfaces.spec.ts` and `test/browser/support/effect-surfaces-witness.ts`: native WebGPU/WebGL witness. A fresh operator provides an isolated reference per size; a prepared operator warms both sizes and processes 50 alternating layers. The witness observes real backend surface texture creation/destruction and RenderTarget disposal deltas, compares decoded PNG pixels including alpha, checks durable output after another layer, records adapter/browser/readback evidence, and verifies native surface destruction on disposal.

Suggested coordinator commands (serial, bounded):

```sh
bunx vitest run packages/render/test/effects/GpuEffects.test.ts packages/render/test/effects/GpuEffects-pool.test.ts packages/render/test/effects/shared/target-pool.test.ts packages/render/test/compositing/effect-resources.test.ts --maxWorkers=1
bunx playwright test test/browser/effect-surfaces.spec.ts --workers=1
```

Use the prepared frozen preview config from `docs/performance/protocol.md` for the browser command when an existing cohort server is available. Native artifacts are written under ignored `artifacts/effect-surfaces/`. This is an allocation/decoded-pixel witness, not a latency or throughput benchmark.

English changelog bullet for the coordinator:

> Reuse bounded, exact-size GPU effect scratch and backdrop surfaces across alternating layer dimensions, with fully charged retained allocations, deterministic eviction, and preserved multi-stage alpha and output ownership.

Limits and remaining verification:

- Idle retention is at most **8 RGBA8 nearest-filtered surfaces / 32 MiB**. A larger active working set is limited to the actual pass needs (at most one scratch and one backdrop); all idle entries are evicted and every remaining byte is still charged to the existing shared hard GPU budget. This introduces no new arbitrary export-size rejection.
- Alternating sizes reuse warmed surfaces when their combined working sets fit this retention window. Larger/more varied workloads intentionally evict and may allocate again.
- Pool targets keep exact raster dimensions; logical source dimensions stay in uniforms. No bucket scaling, altered UV rectangle, CPU pixel readback, alternative renderer, or shared cache API was introduced.
- Shader warming can initialize a sampled surface once before first framebuffer use; the native witness records the real cold allocation count and requires zero creation/destruction/disposal deltas in the subsequent warm alternating interval.
- The pending checklist items require actual coordinator execution. No pixel, allocation, or performance result is claimed yet.

## Validation evidence

First integrated code cohort failed one new multi-effect regression: a shared copy-pass cache reused parameter uniforms between different effect types (`updateParameterUniforms`, missing parameter uniform). Root routed this finding to the owner; no test was weakened. 130 other checks passed. Log: `artifacts/optimization-binoss/unit-01-05.log`. Correction and affected rerun are pending.

Native follow-up: coordinator's first WebGPU witness passed; WebGL passed allocation/accounting checks but failed exact decoded-pixel equality (`maxByte = 255`). Failure artifacts were recovered from the trace. Both isolated WebGL reference PNGs were transparent; the retained wide candidate had colored/partial-alpha content while the tall candidate was transparent.

Instrumentation now persists every reference/candidate plus first-warm, isolated-replay and immediate-replay capture before any assertion, and records console/native GL errors. The coordinator's targeted diagnostic reproduced the discrepancy with no console or GL errors. An additional GPU-only fixed-texture presentation control is prepared to distinguish effect-target contents from shared presentation bindings; original acceptance assertions remain unchanged. Worker has run no checks.

The fixed-texture GPU-only presenter control reproduced the same target contents, ruling out shared `GpuPasses.copyTo` presentation bindings. Source correction prepared: `packages/render/src/effects/shared/texture-binding.ts` supplies a native Three `TextureNode` whose uniform hash is the stable logical input's base-node UUID. `GpuEffects` now uses it for source and backdrop inputs, preventing texture-UUID deduplication from merging independently updated sampler bindings during preparation. A focused regression checks distinct input hashes, cloned-sample sharing, and stable warmup-to-draw identities. The material cache remains keyed by stage and stays bounded. Native assertions are unchanged; coordinator rerun pending.

The coordinator's corrected cohort still failed WebGL pixel equality while WebGPU passed. The speculative stable-input sampler subclass did not affect the failure and has been removed, along with its implementation-only hash regression. The production code again uses standard Three texture nodes.

Prepared a separate native prefix matrix using a fresh renderer: source-only, brightness, blur, gradient glass, brightness+blur, brightness+gradient, gradient+blur and the full stack, each direct/prepared and immediate replay. Full-stack controls also vary the renderer canvas dimensions independently of the effect target. PNGs are persisted under `artifacts/effect-surfaces/<backend>-prefix-*` before the unchanged acceptance assertions; raw JSON records native GL errors and setup dimensions. This diagnostic is pending one coordinator-run targeted WebGL cohort and is intended to identify the first broken graph/setup stage rather than infer a pool fault from an already blank reference.

Concrete fullscreen material correction prepared: the prefix matrix proved that source-only `GpuPasses` rendered valid partial/opaque alpha, while every `GpuEffects` prefix (including a single brightness pass with no scratch allocation) was transparent on WebGL. `GpuPasses` already uses `DoubleSide` for fullscreen quads; `GpuEffects` now applies the same rule instead of default front-face culling. The focused ordered-pass regression checks that each effect/copy material uses `DoubleSide`, alongside its existing source/backdrop feedback and dimension assertions.

Temporary prefix, fixed-presenter and brightness diagnostic code has been removed from the final helper/spec; saved ignored investigation artifacts remain available. The final witness retains only real native allocation/disposal accounting, prepared-versus-isolated multi-stage pixel/alpha equality, durable caller-owned outputs, production readback checks, and reference/actual/raw evidence saved before any assertion. The unsupported sampler subclass remains removed. Final both-backend coordinator validation is pending; no worker checks were run.

No additional production visibility changelog entry is warranted: subsequent evidence attributed transparency to the native witness clear, not effect material culling.

Coordinator rerun: the stack-consistent `DoubleSide` change did **not** resolve WebGL transparency and is not reported as a fix for that discrepancy. Prepared a small generated-shader diagnostic (one brightness pass and a working source-only copy) using native `renderer.debug.getShaderAsync` and CPU-side render-object bindings/uniform buffers. It saves GLSL, texture UUID bindings, control values and two PNGs before the original assertions. No GPU pixel or buffer readback APIs, prefix matrix, or speculative shader modification were introduced. Awaiting the coordinator's targeted diagnostic evidence before changing flow/compositing.

### Final native-harness attribution and correction

The generated brightness GLSL, source texture binding, opacity, amount and CPU uniform packing were valid. Both diagnostic brightness and target-backed copy PNGs were erased. Source inspection identified the exact harness bug: `setRenderTarget(null)` changes Three's logical destination but does not immediately bind WebGL's default framebuffer. In this Three version, `WebGLBackend.clear()` with `descriptor.textures === null` issues `gl.clear()` without rebinding. The witness's manual `renderer.clear()` therefore cleared the **last effect output target** before presenting it. This accounts for every observed pattern: isolated/replayed outputs became transparent, while the first wide capture after alternating work survived because it erased the last-bound tall target instead.

The final witness omits that unnecessary clear: its full-screen `NoBlending` GPU copy binds the canvas destination and overwrites every RGBA pixel. This preserves outputs without a GPU readback or assertion relaxation. Temporary shader diagnostics and the speculative `DoubleSide` producer/test changes have been removed; no production shader, sampler, material-side or compositing fix is claimed. Earlier diagnostic proposals above are investigation history, not final changes. Final pending checks remain the coordinator's focused unit cohort, both native backends and relevant 50-image workload.

### Fifty-image workload readiness handoff

Both final native effect witnesses passed the coordinator's strict allocation and decoded pixel/alpha assertions. The first full workload was interrupted by a Vite reload; its frozen-server rerun exposed a separate stale test baseline. In the preserved frozen trace (`artifacts/optimization-binoss/frozen-browser/frozen-load-50-image-layer-462d5-es-idle-export-and-recovery-chromium/trace.zip`), baseline call `kuct@434` read diagnostic `submitted=30`, `completed=28`, `displayFrames=29`, `pending=1`, while the immediately following `kuct@436` read live `data-render-count=29`. After the observation interval, diagnostics reported `completed=29`, `displayFrames=30`, `pending=0`. `CanvasGpuDiagnostics` deliberately throttles DOM publication to 250 ms; `PlaneResources.present()` publishes live presentation/revision/frame attributes immediately. The test combined those two different snapshots.

Authorized additional changed path: `test/browser/performance.spec.ts`. A narrow pre-idle barrier now waits for `rendererReady`, actual `presentationReady`, matching presented/requested revision, zero pending/active render work, and published submitted/completed/display counters matching the corresponding live canvas counters. It returns one atomic baseline snapshot. The one-second observation window and strict equality for document and display frame counts remain unchanged; no allowed frame, arbitrary startup delay, timeout increase or producer edit was added. Coordinator rerun of the complete fifty-image scenario remains pending. No worker checks were run.

## Final coordinator evidence

Coordinator final validation (2026-11-01): all acceptance criteria passed.
`unit-final-render.log` passed 59 related checks, including the thirty effect/pool/resource checks. Both strict native effect cases in `native-05-final-load.log` passed: four retained surfaces / 30,720 bytes, no additional native allocation/destruction/disposal over 50 warm alternations, exact decoded pixel/alpha equality and zero production readbacks. `native-05-validated-load.log` passed the complete 50-image / 100-effect workload: edits, unchanged idle counters, 2,400×1,500 decoded PNG, save/recovery and a real 768×480 WebP thumbnail (65,298 bytes). Warm source uploads stayed at 97; charged cache bytes stayed below the 384 MiB hard budget; browser errors and production readbacks were zero. The settled baseline correction preserves every strict idle assertion. All TypeScript/type-aware lint/ESLint/format checks passed, rules reported zero violations, and workspace versions match 0.2.0. Temporary shader/sampler/material-side proposals below are historical and absent from the final code. This is rendering/allocation verification, not a production latency claim.
