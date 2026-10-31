# 02-spatial-opacity: implementation and validation checklist

Coordinator status: **validated** (2026-10-31).

## Agent implementation

- [x] Read contracts and confirm file ownership.
- [x] Implement the required behavior without unrelated changes.
- [x] A half-opacity front object reveals a changing rear color on both native backends.
- [x] Test zero/full/fractional opacity, ancestor-group opacity, material alpha, ordering and selected export.
- [x] Preserve cross-object directional/point shadows, masks and opaque depth.
- [x] Document supported transparency semantics without claiming order-independent transparency.
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
typechecks, lint, browser checks or commits were run by this worker.

Changed paths:

- `packages/render/src/spatial/scene/CompositionScene.ts`
- `packages/render/src/spatial/scene/DepthBindings.ts`
- `packages/render/src/spatial/scene/DepthScopes.ts` (new)
- `packages/render/test/spatial/depth-opacity.test.ts` (new)
- `packages/core/test/spatial/opacity.test.ts` (new)
- `test/browser/spatial-opacity.spec.ts` (new)
- `docs/architecture/spatial-layers.md`
- This checklist.

The scope planner considers only prepared native source IDs, keeping work bounded
by the existing 64-source native budget. An opaque source contributes depth when
all its fractional ancestors are shared with the current rendering scope. Thus
opaque siblings still occlude inside a half-opacity group; exterior sources can
show through the group's final alpha. Nested fractional groups have independent
scope keys. One depth target is reused; switching scopes redraws depth without
refreshing shared shadow maps. Native shadows refresh once per composition sample
through the existing shadow revision mechanism. Private depth-material copies
separate eligible and ineligible meshes even when their original material is
shared. Borrowed materials are restored, pruned and disposed through existing
lifecycle paths.

Selection context remains eligible for opaque holdouts, native shadows and
reflections; only its paint is suppressed by the compositor. Material alpha is
independent of layer/group alpha. Effects/masks remain post-composite treatments.

Focused regression commands for the coordinator:

```sh
bun run test -- packages/core/test/spatial/opacity.test.ts packages/render/test/spatial/depth-opacity.test.ts
bun run test:browser -- test/browser/spatial-opacity.spec.ts --workers=1
```

The native witness covers both backends, rear recoloring at 0/0.5/1 alpha,
material alpha, transparent document order, faded-group internal sibling order,
external rear contributions, effect/mask treatments, selected export context,
directional/point shadows across scope changes, exact-sample restoration and
production readback instrumentation. Existing `spatial-composition.spec.ts` and
`spatial-shadows.spec.ts` remain relevant integrated checks.

Task04 ownership handoff: `CompositionScene.ts` and `DepthBindings.ts` are released
after this handoff. Preserve `depthScope` (null means target contents unavailable;
empty string means composition scope; other keys are fractional group IDs) when
adding signature retention. `depthReady` currently also guards one shadow refresh
per sample; signature integration should separate depth retention from shadow
revision eligibility if needed. `DepthScopes.scope(id)` and `.writes(id, scope)`
are the clean scope interface; `DepthBindings.apply` accepts an optional per-mesh
depth eligibility callback. Task07 signature files were not edited.

English changelog bullet:

- Fix native layer and group opacity so partially transparent contributions reveal
  geometry behind them while preserving isolated-group occlusion, shared shadows,
  post-composite masks/effects and selection-export context on WebGPU and WebGL.

Known limitations: transparent contributions retain document order; this does not
implement order-independent transparency, transmission through composed layer
surfaces or path tracing. A single scratch depth target avoids per-group GPU
allocations but redraws depth when consecutive contributions switch scopes.
Native material alpha/transmission rules are preserved rather than replaced.
Acceptance boxes describing rendered results remain unchecked until the
coordinator executes the witnesses.

## Validation evidence

Validated by `/root` on 2026-10-31.

- `unit-02-03-04.log`: all 58 integrated scoped-depth/binding/reflection/selection checks passed.
- `native-integrated.log`: layer/material/faded-group alpha and directional/point shadow witnesses passed on both backends after integration; the earlier native cohort also passed both cases.
- Reviewed nested scopes, borrowed material ownership, opaque selection-context holdouts, masks/effects, fractional layer versus group semantics and exact shadow sampling.
- Source TypeScript/type-aware lint and compatible test syntax passed review; repository rules have zero violations and versions match0.2.0.
- Native transparency retains authored layer order. No order-independent or path-traced transparency is claimed.

Evidence is retained under ignored `artifacts/optimization-binoss/`.
