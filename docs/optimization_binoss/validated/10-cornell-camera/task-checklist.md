# 10-cornell-camera: implementation and verification

## Owner handoff

- [x] Implement the intended result using the frozen shared interface.
- [x] Prepare focused behavior/native regressions and report changed paths.
- [x] Confirm undo/redo, cancellation, stale ownership, validation and cleanup through prepared template regressions, source review and the shared core action contract; execution belongs to coordinator.
- [x] Provide an English changelog bullet and explicit remaining limitations.

Implementation ready; ownership handed back for coordinator validation.

Changed paths:

- `apps/web/src/services/projects/templates/motion/cornell-box.ts`: public `scene-camera-orbit` recipe bound through `addMotionAnimation` to the actual camera owner. Three yaw poses +5° → −5° → +5° over eight seconds; parent, nine objects and lights remain stationary. Parent retains a genuine editable spatial group.
- `apps/web/src/services/projects/templates/motion/asset-revisions.ts` and Cornell preview line in `apps/web/src/services/projects/templates/catalog.ts`: synchronized source/poster revision `4`.
- `scripts/templates/cornell-box.ts` and `apps/web/public/templates/motion/cornell-box.{json,musart,commands.json}`: regenerated portable template and replay journal through the existing public-command generator. Geometry, fonts and assets remain unchanged. Root owns generation/copy/inspection of the actual native `cornell-box.webp` poster.
- `test/scripts/templates/cornell-box.test.ts`: deterministic authoring and generated journal replay; real composition camera owner/shared recipe; no parent/child actions or sampled scene keys; exact yaw poses, closed endpoints, near-zero endpoint velocity, stationary layers/lights/environment, action strength and undo/redo.
- `test/browser/support/cornell-witness.ts` and `test/browser/cornell-box.spec.ts`: real native camera/unchanged-object/light assertions, probe reuse, decoded loop pixels, production readback checks, bounded 32-frame/4-fps export plus separately retained 480-frame/60-fps case. Native near-seam uses the document's 60-fps clock; a separate fifth lossless sample matches the final encoded PTS. Every pixel threshold remains unchanged.
- Same Cornell browser spec: provenance-backed gallery install and persistent reopen are separate serial 90-second cases sharing one real browser context. The reopened URL retains the installed project ID and explicit `automation=1`. Actual kernel/stored-project readiness precedes the unchanged 30-second native check; live and readonly IndexedDB camera actions must match. Captures include timings, project snapshots, canvas state, relevant requests/fonts/workers and browser errors. Two-second capture bounds and caught teardown failures preserve the original test error.
- `docs/guides/cornell-box.md` and Cornell row in `docs/guides/motion-templates.md`: real camera workflow, poster regeneration command and honest native/export/test timing boundaries.

Focused coordinator commands, run serially:

```sh
bun run test -- test/scripts/templates/cornell-box.test.ts --maxWorkers=1
bun run test:browser -- test/browser/cornell-box.spec.ts --grep 'bounded' --workers=1
bun run test:browser -- test/browser/cornell-box.spec.ts --grep 'Cornell gallery' --workers=1
bun run test:browser -- test/browser/cornell-box.spec.ts --grep 'full-rate' --workers=1
```

English changelog bullet:

- Replace Cornell Box's parent turntable with a reusable composition-owned camera orbit, preserving editable stationary objects, coherent lighting and sparse seamless Motion.

Checks actually run by worker: authorized CPU-only `bun scripts/templates/cornell-box.ts` generation and targeted formatting only. No tests, typecheck, lint, build, browser/GPU checks, Git operations or shared changelog edits.

Known limits and coordinator follow-ups:

- Coordinator reported passing Cornell unit checks and both bounded native camera witnesses, including decoded 32-frame WebGPU export, exact seam/midpoint motion, stationary object/light poses and reflection-probe reuse. The full-rate 480-frame case remains available; bounded evidence does not claim it ran.
- Latest gallery evidence showed valid persisted/live camera actions, but a combined preview/install/reload case exhausted its overall 90 seconds. Installed presentation occurred at approximately 58.7 seconds; subsequent cold reload kernel readiness took 16.4 seconds, leaving less than the independent 30-second native render allowance. The approved serial split preserves each existing bound rather than increasing it. It still requires coordinator execution.
- The earlier combined-case trace ZIP was removed from the output directory before worker inspection; source review and saved JSON established that timing overlap, not a renderer defect. No renderer/font/geometry/persistence producer code changed.
- Subsequent split-install trace inspection found a concrete external interruption: `EditorScene.tsx` received an incompatible `makeRenderer` Fast Refresh invalidation at 111,675 ms, followed by `EditorCanvas.tsx` at 113,462 ms. The canvas was recreated during the fixed 30-second readiness check; the expectation failed at 123,768 ms and Open template reported ready at 124,886 ms. Font/geometry/persistence requests were successful. Root will filter foreign HMR only in its ignored native validation wrapper for the manually created context; the checked-in witness keeps normal HMR behavior and all original readiness limits.
- Initial installation now also saves bounded `install-pending` and `install-final` evidence before/after readiness failure, deriving the real project ID from the live kernel or current URL while the installed snapshot is still unavailable. Install-to-native timing is recorded separately. Shared best-effort teardown evidence preserves the original failure and cannot wait indefinitely on a closed page.
- The subsequent HMR-isolated trace established a second, independent harness boundary issue: the native-ready expectation started at 71,815 ms, before document publication at 77,119 ms and the actual canvas renderer backend log at 84,111 ms. Ready was reported at 104,688 ms: 32.87 seconds from the old expectation start, but 20.58 seconds from renderer startup. Geometry/font requests succeeded. The approved harness now explicitly waits up to 30 seconds for the actual native canvas to attach, then preserves the existing 30-second renderer-ready check. Reopen applies the same attachment boundary after kernel/project recovery. Each serial case remains capped at 90 seconds. Click-to-attachment, attachment-to-frame and kernel-to-attachment/frame observations are logged separately; these are functional readiness diagnostics, not GPU-duration, latency or cold-load performance claims. No producer code or rendering/pixel assertion changed.
- Diagnostic JSON is saved under ignored `artifacts/cornell/native/gallery-*.json`; unavailable final captures write host-only timing/error evidence. Existing bounded worker/resource cleanup remains owned by the shared render/core implementation; this template introduces no custom playback loop or GPU resources.
- Shared camera action validation, cancellation and stale owner handling belong to task08/core owner07; template commands consume that contract without new special cases. Source/test files stay below 600 lines.

## Coordinator acceptance

- [x] Review full diff against intended result and architecture contracts.
- [x] Run focused integrated code checks, serially with bounded resources.
- [x] Verify actual native timeline input and rendered/decoded exports on both backends where relevant.
- [x] Verify native Cornell camera motion, fixed object/light poses and seamless endpoints.
- [x] Run affected TypeScript/lint/format, synchronized versions and zero-rule checks.
- [x] Record evidence and resolve failed acceptance criteria through the owner.
- [x] Move this complete directory to validated/ after all criteria pass.

## Validation evidence

All acceptance checks passed; see [coordinator evidence](../../scene-motion-validation.md). Worker reports were reviewed and relevant focused/native/static checks were run by root.
