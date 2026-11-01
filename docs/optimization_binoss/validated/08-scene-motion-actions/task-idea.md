# 08-scene-motion-actions: First-class scene Motion actions

Status: validated by the coordinator; see [shared validation evidence](../../scene-motion-validation.md).

## Intended result

Add typed, portable camera/environment/light-owned animation blocks using the existing Motion preset, interpolation, composition, derived-point and command machinery. Preserve existing layer actions and sceneProperties. Validate ownership and imported values; support action edits, key gestures/easing, previews, undo/redo, duplication, light pruning, reusable preset capture/extraction and shared preview/export sampling.

## Ownership

Agent: `optimization_07`. Owned paths: packages/core/src/motion/**; document/session identity and validation; clipboard/pages integration; core exports and behavior tests.

Root supervises, reviews, runs all tests and archives accepted tasks. Workers implement production/test changes and prepare English changelog bullets, but run no tests, builds, typecheck, lint or browser checks. Targeted formatting is allowed. No worker Git/shared changelog changes or extra agents. Preserve unrelated dirty work and the user's server. Read contribution rules and relevant architecture contracts before editing. One writer per file; coordinate shared interfaces explicitly. Maximum600 lines per code/test file.

## Shared contract

`SceneAnimationOwner` uses camera/environment plus compositionId, or light plus compositionId/lightId. Scene presets use typed relative targets and the generic existing MotionAnimationPreset/instance contract; legacy defaults stay compatible. Optional `motion.sceneAnimations` stores real scene-owned instances. Existing addMotionAnimation accepts a discriminated owner branch; update/delete remain animationId-based. Shared projection exposes direct and derived scene keys; no synthetic persisted layers or duplicate authoritative key sets.
