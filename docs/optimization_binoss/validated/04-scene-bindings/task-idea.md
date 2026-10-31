# 04-scene-bindings: Remove per-source full-scene material synchronization

Priority: P2. Status: validated by coordinator; archived.

## Observed problem

CompositionScene.render calls DepthBindings.apply for every source, and apply traverses every mesh regardless of the active source. With N single-mesh sources this causes N squared material synchronizations after a broad scene invalidation, in addition to preparation. This is a structural operation count, not a measured frame-time claim.

## Required result

Prepare stable depth/color bindings per source/revision and bind only the meshes used by the current pass. Update changed material values once rather than for every sibling render. Keep source originals intact, skinning, morphs, masks, native lighting and exact sample behavior. Do not cache solely on Material.version: uniforms and ordinary material fields may change without that version.

## Owned paths and dependencies

packages/render/src/spatial/scene/{CompositionScene,DepthBindings}.ts after task 02 hands them off; new binding helpers/tests. Rebase conceptually onto task 02, never overwrite it.

## Shared execution rules

- Read the root AGENTS.md instructions and relevant architecture contracts before edits. Core stays pure TS; render owns native Three/TSL/GPU resources; UI uses existing Jotai/Motion/i18n patterns.
- One agent owns this task. One writer per file. Ask the coordinator before touching another task's files or shared interfaces.
- Do not stage, commit, push, rewrite history, edit the shared changelog, or touch unrelated dirty work. Provide an English changelog bullet in the completion handoff.
- Add meaningful focused regressions, but **do not run tests, builds, typechecks, lint or browser cohorts**: `/root` is the sole integrated validation owner. No extra subagents.
- Keep files below 600 lines. Report actual changed paths and proposed commands; worker completion is `implementation ready`, never `validated`.
- The coordinator reviews source changes, runs focused tests and native witnesses serially with bounded resources, and resolves failed acceptance checks through the owner.
- Only the coordinator checks final validation boxes and moves this directory from `active/` to `validated/`. No placeholder completion or synthetic performance claims.
