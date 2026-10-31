# 06-incremental-transactions: implementation and validation checklist

Coordinator status: **validated** (2026-10-31).

## Agent implementation

- [x] Read contracts and confirm file ownership.
- [x] Implement the required behavior without unrelated changes.
- [x] Unchanged pages/assets/layers retain identity for local edits and supported multi-command transactions.
- [x] Operation-count regressions show unrelated pages are not rescanned/revalidated for certified local scalar edits.
- [x] Adversarial duplicate IDs, mask/hierarchy references, invalid Motion values and mixed batches reject atomically.
- [x] Undo/redo, replay, listeners, explicit/generated IDs, deferred reservations and stale concurrent work retain existing guarantees.
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

Status: **implementation ready; no validation commands run**. Acceptance/evidence boxes remain pending coordinator execution.

Implemented:

- `session/scopes.ts` defines typed, closed mutation scopes for project rename, safe page metadata, and safe layer scalar/geometry/layout fields, including guarded replacements of existing spatial pose/material values. An unsupported command or field makes the entire batch use full validation; reference, identity, effects, masks, gradients, spatial-source and Motion mutations are not certified scalar edits.
- `session/spatial-scope.ts` certifies only closed-schema spatial replacements with the same source/enabled/material-mode/shadow capabilities and the same basis/pivot frames. Pose, geometry-value and material-preset/value changes receive complete touched-layer validation; source transitions, spatial creation/removal, frame/capability changes, unknown fields and nested identities/references retain full fallback. Spatial checks share one lazy active-page index across a supported batch.
- `session/drafts.ts` unions all supported batch targets before cloning. Assets, unmodified pages, unmodified layers and nested immutable resources retain identity. Each changed page/layer container is copied once.
- `document/local-validation.ts` requires an engine publication certificate, validates changed project metadata and only touched page metadata/layers, and retains complete layer validation including affine, inset, guide and source constraints. Local commands skip target-pruning scans because their allowlist preserves animation capabilities/addresses. Full import/load and fallback validation retain the existing global ID/reference/Motion checks.
- `document/identity.ts` supplies a complete schema ID collector, now including spatial lights and scene property/key IDs. The engine retains identity indexes by immutable project identity, shares them across scalar commits/history, and updates/reserves them only for fully validated structural changes. Local edits neither clone nor rescan the global ID set, and skip selected-layer ID rescans. Cancelled/deferred work does not publish/reserve IDs; stale reservation guards remain intact.
- Commands are detached before planning their scope, while the existing pre-handler detailed-listener capture remains independent. Commit summaries use owned commands even if a platform clock callback mutates caller input. Full Motion fallback drafts deeply own scene property/key arrays.

Changed source paths:

- `packages/core/src/session/scopes.ts` (new)
- `packages/core/src/session/spatial-scope.ts` (new; spatial follow-up)
- `packages/core/src/session/drafts.ts`
- `packages/core/src/session/commands.ts`
- `packages/core/src/session/engine.ts`
- `packages/core/src/document/local-validation.ts` (new)
- `packages/core/src/document/validation.ts` (shared scalar metadata/layer validation extraction; preserves task 01 affine guards)
- `packages/core/src/document/identity.ts` (additional ownership explicitly approved by coordinator)

Focused regressions:

- `packages/core/test/session/incremental.test.ts` (new): domain-validation/ID-collection/reservation call counts, batch identity, full fallback, cross-page duplicate IDs, masks/references, uncertified imports, affine/layout guards, ancestor locks, summary capture, stale/cancelled reservations, explicit IDs and history indexes.
- `packages/core/test/session/incremental-spatial.test.ts` (new; spatial follow-up): both patch command forms, one touched-layer validation per pose/material batch, no global ID/reservation/Motion scans, unrelated page/layer/assets/Motion identity, owned/frozen material values, exact undo/redo, malformed nested scalar rejection/atomicity, and guarded capability/frame/reference/topology fallback.
- `packages/core/test/session/incremental-scene.test.ts` (new): spatial/scene ID collisions for both allocators, mutable scene array ownership, immutable publication, exact undo/redo, invalid scene values and duplicate imported key IDs.
- `packages/core/test/session/drafts.test.ts`: update the prior single-command-only expectation for supported scalar batches and project rename.

Proposed bounded integrated command (not executed):

```sh
bun run test -- packages/core/test/session packages/core/test/document/identity.test.ts packages/core/test/document/validation.test.ts packages/core/test/animation/recording.test.ts packages/core/test/motion/scene/authoring.test.ts --maxWorkers=1
```

English changelog bullet for coordinator:

> Make certified scalar and 3D pose/material editor transactions validate only touched layer/page domains, preserve unchanged resources across batches, and reuse complete durable ID indexes including scene Motion channels and spatial lights.

Limits:

- Structural/reference/Motion edits, scene replacements, spatial source/capability/frame changes and mixed unsupported batches intentionally retain full project validation; existing safe single-command draft factories remain supported. Spatial pose/material certification requires an existing compatible spatial source on every patch target; effects and gradient topology remain outside this allowlist.
- Touched layer arrays are still copied/indexed by existing layer handlers; this does not claim constant work independent of the active page's layer count. Unrelated page layer/effect/Motion graphs and assets are not scanned by the scalar transaction path.
- The publication hook still registers page references, and page-array cloning/lookup is bounded by the 100-page document limit. Full structural validation and reservation remain proportional to the complete document.
- No wall-clock performance claims, browser changes or native browser checks. No tests, typecheck, lint, builds, formatter, Git staging/commits or shared changelog edits were run/made by the worker.

## Validation evidence

Validated by `/root` on 2026-10-31.

- `unit-06-07.log`: 349 passing related checks; its sole stale pre-existing occurrence assertion was reproduced at baseline and corrected by task07 without changing production movement semantics.
- `followup-code.log`: all 70 follow-up tests passed, including certified spatial pose/material scopes, scene authoring and the corrected occurrence contract.
- Core strict TypeScript passed. Focused application TypeScript passed after unrelated test typing corrections; task06 source had no typing violations.
- Type-aware lint and JSX lint passed; task06 formatting passed. `rules-version.log`: zero rule violations and synchronized0.2.0 versions.
- Native browser checks are not applicable to this pure-core transaction change; native consumers are validated in their rendering tasks.
- Review covered trusted-base certification, closed mutation allowlists, complete ID collection, conservative fallback, rollback, replay/history and stale/cancelled reservations.

All logs are under ignored `artifacts/optimization-binoss/`. No wall-clock speedup is claimed.
