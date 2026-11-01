# 08-scene-motion-actions: implementation and verification

## Owner handoff

- [x] Implement the intended result using the frozen shared interface.
- [x] Prepare focused behavior/native regressions and report changed paths.
- [x] Implement undo/redo, cancellation, stale ownership, validation and cleanup regressions (execution pending).
- [x] Provide an English changelog bullet and explicit remaining limitations.

Implementation ready, not validated. Worker ran targeted formatting only; no tests, builds, typecheck, lint or browser checks. No staging, commits or shared changelog edits.

Frozen public API:

- Generic `AnimationChannel<Target=AnimationTarget>`, `MotionAnimationPreset<Target=AnimationTarget>` and `MotionAnimation<Target=AnimationTarget>` preserve legacy callers. New `SceneAnimationOwner` is `{kind:camera|environment,compositionId}` or `{kind:light,compositionId,lightId}`; `SceneAnimationTarget` uses the matching relative kind/property. `SceneMotionAnimationPreset` and `SceneMotionAnimation` bind through optional portable `motion.sceneAnimations[]`.
- `addMotionAnimation` accepts either the unchanged legacy `{trackId,preset,...}` branch or `{owner:SceneAnimationOwner,preset:SceneMotionAnimationPreset,...}`. Update/delete retain `animationId`; scene commands validate real owners and never allocate fake layers.
- `sceneAnimationOwner`, `sceneAnimationOwnerKey`, `sceneAnimationTarget`, `canApplySceneMotionAnimationPreset`, `projectSceneMotionAnimations`, `projectSceneAnimationProperties`, `projectSceneMotionProperties`, `validateSceneMotionAnimationPreset`, `captureSceneMotionAnimationPreset` and `extractSceneMotionAnimationPreset` are exported.
- Builtins: `scene-camera-orbit` (8000 ms, yaw replace +5/-5/+5 with ease-in-out), `scene-camera-push` (2000 ms, distance multiply 1/.8), `scene-light-pulse` (2000 ms, intensity multiply 1/1.8/1), and `scene-environment-turn` (8000 ms, rotation add 0/360).

Core integration:

- Scene and layer actions share the exact channel compiler, numeric composition/clamping, point timing/retiming/deletion rules, preset point validation and capture/extraction helpers. Ordinary scene keys evaluate before action channels in authored action order, preserving the established add/multiply/replace policy, enabled/strength behavior and sparse portable points.
- Shared derived point IDs/projection feed real owner rows. Existing batch key move/delete, single key move/delete and `createMotionKeyframePreview` support scene action points with endpoint/crossing checks. Easing/value edits update the owning preset through the existing `updateMotionAnimation` command.
- Import validation checks scene target/owner compatibility, value schemas, empty layer-effect slots, bounded points/instances and globally unique action IDs. Canonical identity reservation and composition clipboard duplication include action IDs and remap real composition/light ownership. Light deletion/rig replacement prunes dependent scene actions in the same atomic update/undo.
- Existing preview/export frame compilation/materialization includes scene channels; playback creates no keys. Capture/extraction produces reusable relative recipes with no source composition/light IDs. Static/legacy documents and ordinary layer actions retain their existing structure and composition policy.

Changed core paths: `motion/animations/{model.d.ts,commands.ts,compile.ts,targets.ts,validation.ts,keyframes.ts,extract.ts}`; new shared `animations/{validation-shared.ts,point-edit.ts,preset-utils.ts}`; new `motion/scene/animations/{model.d.ts,targets.ts,catalog.ts,validation.ts,compile.ts,keyframes.ts,extract.ts}`; `motion/{model.d.ts,compile.ts,evaluate.ts,commands.ts,track-commands.ts,keyframe-preview.ts,validation.ts}`; `motion/scene/structure.ts`; `document/identity.ts`; `clipboard/paste.ts`; `index.ts`. No renderer or web UI files were edited for this core task.

Focused regression: `packages/core/test/motion/scene/animations.test.ts` covers builtin capability filtering, sparse camera samples, mixed legacy/direct scene keys, RGB light interpolation, add/multiply/replace order, strength/clamping/disabled/static behavior, derived projection/easing/move/trim/delete, preview immutability and undo, relative preset capture/extraction, clipboard ownership/identity remapping, light pruning and malformed command/import rollback.

Proposed coordinator command: `bun run test -- --maxWorkers=1 packages/core/test/motion/scene/animations.test.ts packages/core/test/motion/animations.test.ts packages/core/test/motion/animations packages/core/test/motion/keyframe-preview.test.ts packages/core/test/motion/scene/authoring.test.ts packages/core/test/clipboard/paste.test.ts`. UI/native and Cornell witnesses are prepared by their respective owners and run only by root.

English changelog bullet: “Add reusable camera, environment and durable-light Motion animation blocks with editable timeline points and curves, shared preview/export sampling, portable preset capture, undo and validated owner remapping.”

Remaining semantics/limitations: no new rendering engine or effects attached to scene owners; scene presets are unitless and target one matching owner kind. Ordinary Inspector keys remain canonical keys evaluated before actions; replacement actions intentionally win afterward, matching legacy layer behavior. Owning action values/curves are edited through the real action Details/timeline rather than implicit contribution inversion. Native rendering/timeline acceptance and all checks remain pending root execution; no pass is claimed by this handoff.

Preview compilation follow-up: `scene/animations/compile.ts` now exposes shared internal `compileSceneAnimation(page, animation)`. `createMotionKeyframePreview` captures each enabled authored instance's flat compiled-channel slice once and recompiles only drafted instances; untouched owners retain the exact compiled-channel object identities and order. New `packages/core/test/motion/scene/animation-preview.test.ts` spies on the real interpolation compiler across repeated camera-point previews with an independent light action, asserts only the affected two segments compile, checks unchanged light sampler identity, zero-delta reuse, and authored frozen-project immutability. Targeted formatting only; coordinator should add this regression to the affected code/static rerun.

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
