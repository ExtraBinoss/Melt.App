# 01-affine-2d: implementation and validation checklist

Coordinator status: **validated** (2026-10-31).

## Agent implementation

- [x] Read contracts and confirm file ownership.
- [x] Implement the required behavior without unrelated changes.
- [x] Reproduce the reviewed scale-loss cases and assert all six world-matrix coefficients in prepared regressions.
- [x] Prepare regressions for rotation plus nonuniform scale/shear, mirrored/nested parents, masks and atomic rejection.
- [x] Prepare regressions for imported legacy documents, serialization, undo and redo.
- [x] Provide a native rendered before/after hierarchy witness for coordinator execution.
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

Status: **implementation ready; not validated**. No tests, builds, typechecks, lint or browser runs were executed by the implementation owner.

The optional portable `Layer.affine` four-coefficient centered residual retains shear/reflection alongside authored rotation/scale. Reparent/ungroup solve the complete local matrix instead of discarding parent scale. Geometry indexing, picking and snapping honor the residual; primitive and normal rendering use the complete quad matrix, including mirrored winding, while cropped sources retain their authored linear basis. Root primitive cache identity includes the basis. A group serving as a mask source rejects ungrouping rather than deleting its mask identity.

Changed source/documentation paths:

- `packages/core/src/document/{model,validation}.ts`
- `packages/core/src/layers/{affine,commands,geometry,geometry-index,grouping}.ts`
- `packages/core/src/layout/snapping/targets.ts`
- `packages/render/src/compositing/{placement-matrix,GpuCompositor,group-viewport,normal-batch}.ts`
- `packages/render/src/compositing/primitives/batch.ts`
- `docs/architecture/contracts.md`
- This checklist.

Prepared regression paths:

- `packages/core/test/layers/affine-hierarchy.test.ts`
- `packages/core/test/layout/snapping/targets.test.ts`
- `packages/render/test/compositing/affine-placement.test.ts`
- `test/browser/affine-hierarchy.spec.ts`

Coordinator commands (one bounded worker):

```sh
bun run test -- --maxWorkers=1 packages/core/test/layers/affine-hierarchy.test.ts packages/core/test/layers/grouping.test.ts packages/core/test/layers/geometry.test.ts packages/core/test/layers/geometry-index.test.ts packages/core/test/layout/snapping/targets.test.ts packages/core/test/session/commands.test.ts packages/core/test/motion/hierarchy.test.ts packages/core/test/spatial/groups.test.ts packages/core/test/masks/commands.test.ts
bun run test -- --maxWorkers=1 packages/render/test/compositing/affine-placement.test.ts packages/render/test/compositing/normal-batch.test.ts packages/render/test/compositing/primitives/batch.test.ts packages/render/test/compositing/group-viewport.test.ts packages/render/test/compositing/group-viewport-render.test.ts packages/render/test/compositing/GpuCompositor.test.ts packages/render/test/cache/keys.test.ts
bun run test:browser -- test/browser/affine-hierarchy.spec.ts --workers=1
```

The native witness exercises both backends, before/after ungroup and reparent, nested reflected/sheared transforms, primitives, masked sources, normal text and special blending. It compares decoded premultiplied pixels per source, checks undo and production readback counters, and writes PNG/JSON evidence under ignored `artifacts/affine-hierarchy/`. Edge tolerances allow the removed intermediate raster's reconstruction change; no performance measurement is claimed.

English changelog bullet: “Preserve complete classic 2D transforms, including nonuniform scale, shear and reflection, when ungrouping or reparenting layers; keep rendering, masks, selection, picking, snapping, portable saves and undo aligned.”

Limits and ownership handoff:

- Existing hierarchy changes retain their structural clipping/isolation semantics; no persistent parent-clip baking is introduced. Group treatments and mask-source identities that cannot be dissolved reject atomically.
- Bases and authored local scales must satisfy the existing inversion threshold and portable numeric limits; out-of-range results reject rather than approximate. Animated hierarchy guards remain in place, and native spatial basis capture is unchanged.
- `packages/core/src/document/validation.ts` is released to the coordinator/task06 now; no further task01 write is planned.
- Task07 owns the agreed `packages/render/src/cache/keys.ts` residual exclusion/child-placement invalidation changes. Task04 should include `affine` in classic-layout spatial dependencies/signatures.

## Validation evidence

Validated by `/root` on 2026-10-31. All selected affine code regressions passed. `native-integrated.log` records all four native hierarchy cases passing (ungroup/reparent on WebGPU/WebGL), including masks, reflected/sheared parents, normal and primitive batches, text, special blending and undo. Core/source typing, type-aware lint and formatting passed; repository rules are zero and versions match0.2.0. Existing structural clipping semantics remain documented.
