# 07-property-dependencies: implementation and validation checklist

Coordinator status: **validated** (2026-11-01). See final evidence below.

## Agent implementation

- [x] Read contracts and confirm file ownership.
- [x] Implement the required behavior without unrelated changes.
- [x] One typed descriptor contract identifies supported values, interpolation/capability and rendering dependencies.
- [x] Geometry/material/pose/effect changes invalidate exactly their required outputs; no stale frames when neighbours influence depth, shadows or reflections.
- [x] Composition camera, environment and durable light properties can be authored and sampled through real validated Motion commands, including undo/redo and serialization.
- [x] Preview/export use identical sampled scene properties and preserve legacy layer/effect tracks.
- [x] Demonstrate reduced work for an appearance-only edit with scene reflections disabled, and correct recapture with reflections enabled.
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

Independent implementation ready; not validated. No tests, typecheck, lint, build or browser cohort were executed by this worker. Targeted `oxfmt` completed on owned files. No shared changelog or Git staging/commit changes.

Implemented:

- Core descriptors now expose value schemas, interpolation, animatable capability and explicit geometry/appearance/world/projection/depth/shadow/probe/composite dependencies. Spatial source partitions keep opaque RGB/material edits out of shared depth inputs, include alpha/transmission/coverage and affine/world transforms conservatively, and keep post-composite effects local.
- Added optional portable `CompositionMotion.sceneProperties`, with real `{kind: camera|environment, compositionId, property}` and `{kind: light, compositionId, lightId, property}` targets. Legacy layer/effect targets are unchanged. Existing validated upsert/move/delete and batch-key commands support scene keys, including rollback, undo/redo, serialization, imported-data validation and imperative retiming previews.
- Shared compilation/evaluation/frame materialization samples scene properties for preview and export. Missing legacy spatial descriptions resolve deterministic defaults; authoring materializes durable light identities. Light deletion/lighting-rig replacement prunes dependent channels atomically; composition clipboard duplication remaps composition/light/property/key identities.
- Camera, environment intensity/rotation, and light controls have translated key diamonds and removal controls. Numeric presentation observes transport imperatively. Scene edits at nonzero time route through armed/Auto-key channels in one transaction; cancellation/time/owner changes retire the owned draft. Discrete type/color/projection controls observe sampled values at their leaves.
- Added explicit native signatures in `packages/render/src/cache/spatial-signatures.ts`; camera projection is excluded from world/probe/shadow inputs. `cache/keys.ts` excludes classic affine from source-local identity and includes it in child placement identity.

Changed paths:

- `packages/core/src/motion/{model.d.ts,commands.ts,compile.ts,evaluate.ts,frame.ts,interpolation.ts,keyframe-preview.ts,track-commands.ts,validation.ts}`; `motion/properties/{model.d.ts,registry.ts,validation.ts}`; new `motion/scene/{model.d.ts,properties.ts,commands.ts,validation.ts,compile.ts,keyframes.ts,structure.ts}`.
- New `packages/core/src/spatial/properties.ts`; `packages/core/src/index.ts`; `packages/core/src/pages/commands.ts`; `packages/core/src/clipboard/paste.ts`.
- `packages/render/src/cache/keys.ts`; new `packages/render/src/cache/spatial-signatures.ts`.
- `apps/web/src/components/spatial/{SpatialSceneProperties.tsx,SpatialLightEditor.tsx,use-scene-preview.ts}`; new `{SceneMotionField.tsx,SceneMotionValue.tsx,SceneNumberInput.tsx,scene-motion-edit.ts}`; all twelve spatial locale resources.
- New regressions: `packages/core/test/motion/scene/authoring.test.ts`, `packages/render/test/cache/spatial-signatures.test.ts`, `apps/web/test/components/spatial/scene-motion-edit.test.ts`, `test/browser/spatial-property-dependencies.spec.ts`.

Renderer/session integration handoff:

- Task04 has implemented the native signature helper integration, per-source `CompositionScene.sourceStamp`, retained depth/shadow inputs and `SpatialSources.reflectionStamp` wiring. Its additional original-model-material coverage dependency fix is preserved.
- Task06 owns session publication/drafts/identity integration. Root reports the integrated 06/07 unit cohort passed 349 tests with one independently reproduced baseline occurrence assertion; the stale assertion is corrected below and awaits coordinator rerun.

Proposed focused commands (coordinator only, serial/bounded):

- `bun run test -- --maxWorkers=1 packages/core/test/motion/scene/authoring.test.ts packages/core/test/motion/commands.test.ts packages/core/test/motion/keyframe-preview.test.ts packages/core/test/clipboard/paste.test.ts packages/render/test/cache/spatial-signatures.test.ts packages/render/test/cache/keys.test.ts apps/web/test/components/spatial/scene-motion-edit.test.ts`
- `bun run test:browser -- test/browser/spatial-property-dependencies.spec.ts --workers=1` (after native signature integration; writes ignored PNG witnesses under `artifacts/property-dependencies/`). It instruments real retained native source renders, verifies local recolor work versus probe-dependent receiver rerenders, samples camera/light/environment and renders changing output on both backends, with production readback counters.
- Relevant static/rules/version checks remain coordinator-owned.

English changelog bullet:

- Add durable camera, light and environment Motion channels with validated keyframe authoring, Auto-key, undo and portable serialization, and separate native geometry, appearance, depth, shadow and reflection dependencies so local paint edits can reuse unaffected sources.

Explicit limitations:

- Native implementation integration is complete across the owners; passing native acceptance witnesses remain coordinator-owned.
- Scene channels are exposed through scene inspector controls and existing key commands; they do not yet appear as dedicated composition rows in the layer occurrence timeline. Scene presets/block recipes and environment asset/preset keyframes remain unsupported structural operations.
- New focused native Inspector and decoded-video witnesses are implemented below but have not been run by this worker. All validation remains coordinator-owned.
- Legacy static alpha light-color literals still import and round-trip unchanged. New Motion light colors use RGB6; RGB3 base descriptions normalize to RGB6 for animation. A legacy alpha base must be changed through the color control to an RGB value before its color channel becomes available. Layer RGBA support remains unchanged.

### Review follow-up implementation handoff

Implementation ready, not validated. This follow-up changed only:

- `packages/core/src/motion/scene/properties.ts`: RGB6 light-color keys/interpolation and RGB3 base descriptor normalization; no changes to portable static scene validation or ordinary layer/effect colors.
- `packages/core/test/motion/scene/authoring.test.ts`: exact intermediate red/blue color `#800080`, rejection of alpha keys/imported animation values, RGB3 support, and unchanged legacy static alpha-literal serialization/import.
- `packages/core/test/motion/occurrence-commands.test.ts`: correct the pre-existing stale group-occurrence test to assert the documented descendant interval/key shift, stationary sibling parent timing, and unchanged lock rejection. No production group-move semantics were changed. An inherited child end follows the expanded five-second duration before the move, so the moved child ends at six seconds.
- All twelve `apps/web/src/components/spatial/locales/{ar,de,en,es,fr,it,ja,ko,nl,pl,pt,zh}.json` provide the new removal text.
- `test/browser/spatial-scene-authoring.spec.ts`: real native Inspector diamond authoring and primary-pointer Auto-key scrub at a one-second playhead, unchanged root commit/revision counters during the draft, one committed transaction, undo/redo, Escape cancellation, key removal and page-style/readback checks. The second test exports nine real native video frames on each backend with scene-only camera, RGB-light and environment channels changing in independent three-frame phases.
- `test/browser/support/spatial-scene-motion-witness.ts`: native Motion video encoding without injected layer keys, decoding through Mediabunny on a separate uninstrumented inspection page, phase-by-phase pixel changes and red/blue-light pixel checks. Exports and evidence go under ignored `artifacts/property-dependencies/`.

Targeted formatting completed. No tests, builds, typecheck, lint or browser cohorts were executed by this worker. Proposed incremental coordinator commands:

- `bun run test -- --maxWorkers=1 packages/core/test/motion/scene/authoring.test.ts packages/core/test/motion/occurrence-commands.test.ts packages/core/test/motion/track-move.test.ts`
- `bun run test:browser -- test/browser/spatial-scene-authoring.spec.ts test/browser/spatial-property-dependencies.spec.ts --workers=1`

English changelog addition if desired: “Keep animated light colors native RGB-compatible, translate scene key removal across all supported languages, and verify scene keyframe gestures and encoded camera/light/environment animation with native browser witnesses.”

Strict TypeScript review follow-up: `motion/commands.ts` retains the narrowed legacy target in a local before the property-search callback; `motion/keyframe-preview.ts` conditionally overrides sceneProperties only when scene drafts exist, preserving exact optional-property semantics. No unsafe casts, behavioral changes, tests or typechecks were introduced in this fix.

Native follow-up correction (implementation ready; coordinator validation pending):

- `apps/web/src/components/spatial/SceneNumberInput.tsx` now supplies the currently sampled value as the NumberInput value as well as its imperative presentation, matching the existing layer Motion input contract. Rerenders after Auto-key/undo/redo can no longer reset cancellation state to the authored base value.
- New `apps/web/test/components/spatial/SceneNumberInput.test.tsx` reproduces nonzero-time Auto-key authoring, undo/redo, preview and Escape. It asserts restoration of sampled intensity 2 over canonical intensity 1, no draft document revision, preserved authored key, and zero React commits during preview/cancellation.
- `test/browser/support/spatial-scene-motion-witness.ts` uses static relative core/render entry imports so Vite resolves the witness outside the workspace packages. Mediabunny remains the root dependency. Strict native UI and nine-frame two-backend video assertions are unchanged.
- Targeted formatting only; no tests/build/typecheck/browser runs by this worker. Add the new DOM regression to the coordinator's focused unit command before rerunning `test/browser/spatial-scene-authoring.spec.ts`.

Sampled light-type capability correction (implementation ready; coordinator validation pending):

- `apps/web/src/components/spatial/SpatialLightEditor.tsx` now evaluates target XYZ and spot angle/softness visibility inside a leaf `SceneMotionValue` subscription to light type. A sampled Spot exposes its controls and a sampled Point hides directional targeting, while the Inspector/authoring component stays stable. Static descriptions keep the same fallback behavior and registry capability remains available for dormant controls.
- New `apps/web/test/components/spatial/SpatialLightEditor.test.tsx` seeks directional → spot → point keys, verifies sampled select/control agreement, unchanged authored directional type/page identity and parent render count, and preserved dormant angle/target capability. A separate static fallback case verifies point → spot prop changes.
- Targeted formatting only; no tests or checks run by this worker. Coordinator should include this file in the focused DOM cohort. Existing native UI and video assertions are unchanged.

Encoded-light-color diagnostic handoff (implementation ready; coordinator rerun pending):

- Root reports native Inspector authoring now passes, and encoded exports change all three channel phases, but the blue-dominance assertion fails on backend 0.
- Both native videos are now written before decoding/assertions. Both decoded measurements and all nine PNG frames per backend, plus the exact sampled camera/environment/light descriptions, are saved before strict blue/red/phase assertions. The geometry, lighting fixture and meaningful thresholds are unchanged.
- Updated only `test/browser/spatial-scene-authoring.spec.ts` and its support witness. No tests/build/browser execution by this worker.
- Static native-source investigation identifies a plausible actual renderer clock issue: Three `AnalyticLightNode` uses `NodeUpdateType.FRAME` and copies color/intensity in `update()`, while common Renderer.render does not advance NodeFrame; compileAsync and the native Animation RAF do. Exact export can sample multiple scene poses within one RAF, retaining a previous light color. Existing SharedShadows already handles its analogous per-sample update. Renderer ownership must resolve this through native Three light-node update policy, without RAF waits or weakening the color witness.

## Validation evidence

Pending coordinator execution.

## Final coordinator evidence

Coordinator final validation (2026-11-01): all scoped acceptance criteria passed.
Related session/Motion follow-up passed 70 checks; signature/interner follow-up passed 26; final scene field, sampled-light visibility, authoring and cancellation cohort passed 16. `native-03-07-corrected.log` passed both dependency/receiver witnesses on WebGPU and WebGL. `unit-final-render.log` passed 59 rendering checks including real unchanged-frameId/changed-renderId light updates, clone ownership and cleanup. `native-final-scene.log` passed all seven scenarios: exact same-task light colors/intensities for Directional/Point/Spot; native Inspector key diamonds, one-transaction Auto-key, undo/redo and Escape; two nine-frame decoded scene-only camera/light/environment videos; dense GLB reflection receivers; native text/SVG/shape exports; inline gizmo/orbit/undo; and parent-group gizmo/undo. The corrected WebGPU light phase contains 2,450 blue-dominant pixels; both backends pass all phase/color assertions and production readbacks remain zero. Exact native lighting now uses public renderer-local Three light-node registrations with per-render updates in composition, standalone and reflection paths, without manipulating NodeFrame or forcing RAF. All affected TypeScript/lint/format checks passed, rules reported zero violations, and workspace versions match 0.2.0. The explicit timeline-row, preset/asset animation and legacy static alpha-color limitations below remain in scope documentation.
