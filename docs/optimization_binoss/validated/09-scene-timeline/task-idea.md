# 09-scene-timeline: Unified scene timeline authoring

Status: validated by the coordinator; see [shared validation evidence](../../scene-motion-validation.md).

## Intended result

Display genuine Camera, Environment and per-light owner rows in both timeline modes. Reuse canvas projection/virtualization, key selection/drag/delete/easing and action add/edit/move/trim/strength/enable/delete. Never represent scene owners as fake document layers or send scene IDs to Engine.select. Preserve imperative previews, one undo transaction, cancellation, supported preset filtering, My presets persistence and all twelve UI locales.

## Ownership

Agent: `scene_motion_timeline`. Owned paths: apps/web/src/components/motion/**; relevant spatial Inspector adapters; motion UI services/state and saved preset storage; relevant UI tests.

Root supervises, reviews, runs all tests and archives accepted tasks. Workers implement production/test changes and prepare English changelog bullets, but run no tests, builds, typecheck, lint or browser checks. Targeted formatting is allowed. No worker Git/shared changelog changes or extra agents. Preserve unrelated dirty work and the user's server. Read contribution rules and relevant architecture contracts before editing. One writer per file; coordinate shared interfaces explicitly. Maximum600 lines per code/test file.

## Shared contract

`SceneAnimationOwner` uses camera/environment plus compositionId, or light plus compositionId/lightId. Scene presets use typed relative targets and the generic existing MotionAnimationPreset/instance contract; legacy defaults stay compatible. Optional `motion.sceneAnimations` stores real scene-owned instances. Existing addMotionAnimation accepts a discriminated owner branch; update/delete remain animationId-based. Shared projection exposes direct and derived scene keys; no synthetic persisted layers or duplicate authoritative key sets.
