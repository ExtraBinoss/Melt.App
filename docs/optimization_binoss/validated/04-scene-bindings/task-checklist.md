# 04-scene-bindings: implementation and validation checklist

Coordinator status: **validated** (2026-10-31).

## Agent implementation

- [x] Read contracts and confirm file ownership.
- [x] Implement the required behavior without unrelated changes.
- [x] Instrument actual material synchronization counts for increasing source counts and show linear work for an unchanged material set.
- [x] Retain actual rendering on both backends, original/overridden GLBs and multi-material sources.
- [x] Prepare focused regressions for paint/material fields without needsUpdate, disposal and source removal.
- [x] Preserve task 02 opacity semantics, shadows, selection exports and Motion sampling.
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

Status: implementation ready; coordinator validation pending. No tests, builds,
typechecks, lint, browser cohorts or Git mutations were run by this worker.
Targeted `oxfmt` completed on the changed code/test paths.

Changed paths:

- `packages/render/src/spatial/scene/CompositionScene.ts`
- `packages/render/src/spatial/scene/DepthBindings.ts`
- `packages/render/src/spatial/SpatialSources.ts` (final task07 source-stamp wiring only)
- `packages/core/src/spatial/properties.ts` (authorized handoff: conservatively include
  GLB original/override material mode in coverage dependencies)
- `packages/render/test/cache/spatial-signatures.test.ts` (authorized regression)
- New `packages/render/test/spatial/scene-bindings.test.ts`
- New `packages/render/test/spatial/composition-scene-bindings.test.ts`
- New `test/browser/spatial-scene-bindings.spec.ts`
- New `test/browser/support/spatial-dependency-witness.ts` (shared static-import hook harness)
- `test/browser/spatial-property-dependencies.spec.ts` (authorized task07 hook-loading fix only)
- This checklist.

Implementation:

- Each sample collects source mesh bindings once, after reflection preparation.
  Every distinct borrowed material has stable color, depth-writing and holdout
  variants. Each variant copies live fields once per preparation, irrespective of
  Material.version; repeated source renders only assign prepared variants.
  Shared multi-material slots deduplicate synchronization. Shader graph keys and
  opacity/mask-node replacement remain independently observable.
- Each source color pass binds only that source's mesh list. Common depth passes
  select existing depth/holdout variants through the unchanged task02 DepthScopes
  planner, retaining fractional-group and selection-context semantics. Borrowed
  mesh, geometry, skeleton, morph and source-material ownership is preserved.
- `DepthBindings.stats()` and `CompositionScene.bindingStats()` count actual calls
  to `copySpatialMaterial` and actual mesh assignments. Unit/native witnesses
  assert `3N` synchronizations for N distinct one-mesh source materials and zero
  synchronization during N sibling source renders. These are executable expected
  operation counts, not measured timings or a claim that the witnesses passed.
- CompositionScene now consumes task07's explicit signatures and exposes bounded,
  interned `sourceStamp(id)` values. SpatialSources uses each source's stamp.
  Appearance-only changes with environment reflections preserve unrelated native
  surfaces; scene-probe dependencies remain included when scene reflections apply.
- Retained depth validity includes projection, coverage and target size. Native
  shadow validity is independent and excludes camera/gate changes. A depth-scope
  switch reuses valid shadows. Geometry/coverage/light-shadow changes advance the
  shared shadow revision before the next full-scene prepass, including several
  exact samples in one RAF. Release and failed prepasses invalidate availability;
  failure paths restore borrowed bindings and renderer state.
- Original/overridden GLB mode is a coverage dependency because native imported
  alpha may differ from override alpha; this also invalidates neighbour source
  stamps, beyond merely marking the scratch depth target unavailable.

Focused commands for the coordinator (serial, bounded):

```sh
bun run test -- --maxWorkers=1 packages/render/test/spatial/scene-bindings.test.ts packages/render/test/spatial/composition-scene-bindings.test.ts packages/render/test/spatial/depth-opacity.test.ts packages/render/test/cache/spatial-signatures.test.ts
bun run test:browser -- test/browser/spatial-scene-bindings.spec.ts test/browser/spatial-property-dependencies.spec.ts test/browser/spatial-opacity.spec.ts --workers=1
bun run test:browser -- test/browser/spatial-model-reflections.spec.ts test/browser/spatial-import-motion.spec.ts test/browser/spatial-shadows.spec.ts --workers=1
```

The new native witness instruments the real retained composition renderer at 4
and 12 sources on both backends, checks real synchronization/assignment counts,
changed paint output, exact-sample restoration and production readback counters.
The task02/task07 witnesses cover isolated alpha scopes, masks, selected exports,
probe-dependent recapture and sampled scene properties; existing imported-model
and shared-shadow witnesses cover original/override GLBs and clip sampling.
Unit regressions additionally retain multi-material array slots, skeleton/morph
ownership, node masks, unversioned colors/opacity/uniforms, source removal,
private-material disposal, camera-versus-shadow signatures and failed draws.

English changelog bullet:

- Prepare native color/depth material bindings once per composition sample and
  bind only active source meshes, with per-source dependency stamps that reuse
  unaffected paint, depth and shadow work while preserving scoped opacity and
  original/overridden GLB coverage.

Known limitations:

- Every sample still synchronizes all active distinct material variants once;
  this intentionally observes ordinary field and uniform changes without relying
  solely on Material.version. The optimization removes sibling-pass repetition,
  not the required linear preparation. Three variants use bounded accounted
  private materials and dispose when their borrowed originals leave the scene.
- The single task02 scratch depth texture redraws on fractional-scope switches.
  Such passes still process world depth; the material synchronization count stays
  linear. This is not a claim that all renderer work is linear in scope count.
- Skinning/morph regressions assert preserved native mesh ownership; a separate
  newly generated skinned GLB pixel fixture was not added. Existing animated GLB
  and the coordinator's native cohorts remain the rendering witnesses.
- All rendered-result and measured-count acceptance boxes remain pending until
  the coordinator executes the focused checks.

## Validation evidence

Validated by `/root` on 2026-10-31. `unit-02-03-04.log` passed 58 related checks and `static-final.log` passed 26 signature/interner/lifecycle regressions. `native-integrated.log` proves12 synchronizations for4 sources and36 for12 sources on BOTH backends, with zero material synchronizations in sibling source passes. `native-03-07-corrected.log` proves an environment-only recolor renders only the changed source, scene-reflection edits recapture and render receivers, and explicit terminal-preview samples retain active layers and exact scene values. No production readbacks. Type-aware/source checks and zero-rule/version gates passed; native harness URL/counter/endpoint assumptions were corrected without changing producer behavior. A source's world depth still redraws when the single scratch target changes fractional scope; no whole-renderer linearity or FPS claim is made.

### Exact-light follow-up (2026-11-01)

The task04 owner also implemented the task07 native sampling correction through renderer-local Three light/node subclasses with per-render updates. SpatialResource, CompositionScene and reflection CaptureScene share the helper; owned light disposal releases node listeners and shadow resources while borrowed lights remain untouched. All 59 rendering regressions and all seven final native scenarios passed, including exact red/blue/dim sequences for all three light types and both decoded scene-only videos. Final TypeScript, lint, format, zero-rule and synchronized-version checks passed.
