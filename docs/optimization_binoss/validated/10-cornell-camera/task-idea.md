# 10-cornell-camera: Real Cornell camera orbit

Status: validated by the coordinator; see [shared validation evidence](../../scene-motion-validation.md).

## Intended result

Replace the parent-group turntable with one genuine camera-owned Motion action. Keep objects and lights fixed and editable. Use sparse semantic orbit poses with matching loop endpoints and ease-in-out; no sampled key spam or template-specific frame code. Regenerate portable data/journal and a genuine native poster, updating asset revision and poster URL together.

## Ownership

Agent: `optimization_03`. Owned paths: Cornell template builder, manifest/journal/poster and revision references; Cornell scripts/tests/native witness; Cornell guide and catalogue documentation.

Root supervises, reviews, runs all tests and archives accepted tasks. Workers implement production/test changes and prepare English changelog bullets, but run no tests, builds, typecheck, lint or browser checks. Targeted formatting is allowed. No worker Git/shared changelog changes or extra agents. Preserve unrelated dirty work and the user's server. Read contribution rules and relevant architecture contracts before editing. One writer per file; coordinate shared interfaces explicitly. Maximum600 lines per code/test file.

## Shared contract

`SceneAnimationOwner` uses camera/environment plus compositionId, or light plus compositionId/lightId. Scene presets use typed relative targets and the generic existing MotionAnimationPreset/instance contract; legacy defaults stay compatible. Optional `motion.sceneAnimations` stores real scene-owned instances. Existing addMotionAnimation accepts a discriminated owner branch; update/delete remain animationId-based. Shared projection exposes direct and derived scene keys; no synthetic persisted layers or duplicate authoritative key sets.
