# 03-reflection-admission: implementation and validation checklist

Coordinator status: **validated** (2026-10-31).

## Agent implementation

- [x] Read contracts and confirm file ownership.
- [x] Implement the required behavior without unrelated changes.
- [x] A receiver larger than the capture triangle budget still receives a bounded scene probe.
- [x] Cover original and overridden GLB materials, multiple meshes, zero contributors and budget limits.
- [x] Retain idle caching, gesture deferral, exact export samples and cancellation.
- [x] Verify source materials/textures/skeletons remain borrowed and private resources are disposed (source review and regression assertions prepared; execution belongs to coordinator).
- [x] Record changed files, focused test paths, an English changelog bullet and known limitations below.

## Coordinator validation

- [x] Review the full diff against every acceptance criterion.
- [x] Run integrated focused code regressions (one bounded worker).
- [x] Run relevant native browser checks where rendering/interaction changes.
- [x] Run affected static checks, version check and rules check (zero violations before commit).
- [x] Inspect cancellation, cleanup, error paths and undo/redo where relevant.
- [x] Record actual results and fix any findings through the task owner.
- [x] Archive this directory under validated/ only after all required checks pass.

## Implementation handoff

Status: implementation ready; no tests, browser checks, static checks, builds, staging or commits run by this worker.

Changed paths:

- `packages/render/src/spatial/reflections/SceneReflections.ts`: capture contributors remain budgeted; reflective receivers and probe placement use all eligible meshes. One capture contributor, or zero admitted contributors with multiple actual meshes, no longer disables valid receivers. Shared cache accounting now synchronizes even when asynchronous preparation/capture is cancelled.
- `packages/render/src/spatial/reflections/signature.ts`: include chosen receiver keys and probe positions so moving an omitted receiver invalidates its capture.
- `packages/render/src/spatial/reflections/Resource.ts`: preflight private receiver materials independently of admitted capture meshes, account copied instance color buffers, and retain room for previous private bindings during replacement.
- `packages/render/src/spatial/reflections/meshes.ts`: document that admission applies only to capture contributors.
- `packages/render/test/spatial/reflection-admission.test.ts`: genuine >500,000-triangle prepared receiver meshes exercise GLB original/override, text/shape eligibility, multiple meshes, zero admitted contributors at each quality, limits, shared accounting, borrowed ownership, idle reuse, omitted-receiver movement, preview deferral, playback cadence, exact samples, cancellation and cleanup.
- `packages/render/test/spatial/reflection-capture.test.ts`: retain skinning regression and add private instance matrix/color buffer ownership and cleanup assertions.
- `test/browser/support/dense-reflection-glb.ts`: self-contained indexed sphere GLB with 258,480 nondegenerate triangles and 130,321 vertices; no synthetic count padding or repeated degenerate triangles.
- `test/browser/spatial-reflection-admission.spec.ts`: both native backends and original/override materials; actual prepared inventory must exceed the balanced budget while diagnostics report two contributors/24 triangles, one omitted mesh and one receiver/probe. Decoded receiver pixels must respond to neighbor color, with zero response in environment-only control. Assert stable warm allocation/captures, bounded shared GPU bytes and zero production JS pixel reads.

Focused coordinator commands (serial, bounded):

```sh
bun run test -- packages/render/test/spatial/reflection-admission.test.ts packages/render/test/spatial/reflection-capture.test.ts --maxWorkers=1
bun run test:browser -- test/browser/spatial-reflection-admission.spec.ts test/browser/spatial-model-reflections.spec.ts --workers=1
bun run test:browser -- test/browser/spatial-composition.spec.ts --grep 'neighbours drive shared reflections' --workers=1
```

English changelog bullet:

- Keep dense reflective GLB, text and shape meshes eligible for shared scene probes when capture budgets omit their geometry; retain bounded captures, correct omission diagnostics and private resource accounting.

Limits and pending evidence:

- All implementation files remain below 600 lines. No edits to `SpatialSources.ts`, shared cache signatures or `scene/**`.
- Capture omissions remain intentional: an omitted mesh receives neighboring geometry through a probe but its own dense geometry does not appear in other captures. Existing mesh-level self exclusion and shared-probe approximation are unchanged.
- The existing single-mesh fast path still uses the ordinary environment because it has no neighboring mesh to capture. Multiple visible meshes can receive bounded environment/background probes even when all contributors exceed admission.
- Unit tests stub GPU compilation/capture only to inspect admission, ownership and scheduling. The native witness is required to establish actual pixels and backend correctness; its results and thresholds have not been executed by this worker.
- The new native witness renders a genuine dense GLB in four serial backend/material combinations; it is a focused rendering correctness witness, not a frame-time benchmark or the unrelated 50-image effect workload.
- Coordinator follow-up: `artifacts/optimization-binoss/native-02-03-04.log` reported 14 cold targets versus 15 after changing the neighbor. Source review identified the intentional second presentation buffer: `GpuCompositor` returns the cached root for unchanged frames, then `LayerTargets.nextPresentationRole()` allocates `presentation-b` on the first changed frame. The witness now requires exact first/warm equality, exactly one additional 256×256 RGBA presentation target on the first change, and unchanged target/byte ownership both when warming that changed scene and alternating the two scenes. Every combination's decoded pixel measurements and allocation snapshots are saved to `artifacts/scene-reflections/dense-glb/measurements.json` before assertions. No production change was warranted by that failure; coordinator rerun remains pending.
- Coordinator's next native run established the receiver pixel proof in all four backend/material combinations: 1,742–1,745 changed receiver pixels and zero environment-only control changes. The cache correctly charged 8,088–8,098 retained signature bytes in addition to the new 262,144-byte presentation target. The witness now logs that metadata separately and caps its growth at 16 KiB for this three-source/two-paint fixture; exact target-count growth, the hard 128 MiB total budget, and exact warm/alternating target-and-byte stability remain required. Production changes were not warranted. Worker ran no checks; coordinator rerun remains pending.

## Validation evidence

Validated by `/root` on 2026-10-31. `unit-02-03-04.log` passed all 58 related checks. `native-03-07-corrected.log` passed the real258,480-triangle GLB witness across both backends and both material modes. Receiver pixel changes:1,742–1,745; disabled-reflection controls:0. Captures admit24 neighbour triangles and omit the dense receiver while still applying its probe. Warm and alternating target/byte ownership is stable under 128MiB; the first changed frame adds the intentional presentation buffer plus charged signature metadata. Production readbacks remain zero. Source typing/lint/rules checks passed; test casts were replaced with actual NodeMaterial narrowing. Capture omissions and single-mesh environment fallback remain explicit.
