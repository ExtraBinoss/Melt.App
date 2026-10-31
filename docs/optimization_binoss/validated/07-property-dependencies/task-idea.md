# 07-property-dependencies: Unify property capabilities and explicit render dependencies

Priority: P2 / architectural. Status: validated by coordinator; archived.

## Observed problem

Existing Motion/property/effect registries are useful but do not consistently describe geometry, paint/uniform, depth/shadow, reflection and compositing dependencies. A global 3D signature contains all source appearance, so local changes can invalidate every source. Camera, lights and environment are also outside the current layer/effect Motion target contract.

## Required result

Create a typed shared property/dependency contract used by authoring capabilities, Motion and render invalidation. Separate source geometry, appearance, world/depth/shadows, probes and final compositing signatures; retain conservative dependencies where physically necessary. Add proper durable composition/camera/light/environment Motion targets and validated sampling/undo/export integration rather than reserved fake layer IDs or arbitrary object-path setters. Preserve portable-format compatibility. The UI must consume the contract and expose useful scene keyframe controls with existing translated patterns. Keep pure descriptors in core and GPU resources in render. Any deliberate remaining limitation must be explicit, not called complete.

## Owned paths and dependencies

packages/core/src/motion/**; packages/core/src/spatial property/dependency modules; packages/render/src/cache/keys.ts and source-key helpers; apps/web/src/components/spatial/{SpatialSceneProperties,SpatialLightEditor}.tsx and relevant Motion control adapters/resources; focused tests. Own packages/core/src/index.ts exports. CompositionScene.ts ownership is task 02 then 04: request a handoff for final dependency integration.

## Shared execution rules

- Read the root AGENTS.md instructions and relevant architecture contracts before edits. Core stays pure TS; render owns native Three/TSL/GPU resources; UI uses existing Jotai/Motion/i18n patterns.
- One agent owns this task. One writer per file. Ask the coordinator before touching another task's files or shared interfaces.
- Do not stage, commit, push, rewrite history, edit the shared changelog, or touch unrelated dirty work. Provide an English changelog bullet in the completion handoff.
- Add meaningful focused regressions, but **do not run tests, builds, typechecks, lint or browser cohorts**: `/root` is the sole integrated validation owner. No extra subagents.
- Keep files below 600 lines. Report actual changed paths and proposed commands; worker completion is `implementation ready`, never `validated`.
- The coordinator reviews source changes, runs focused tests and native witnesses serially with bounded resources, and resolves failed acceptance checks through the owner.
- Only the coordinator checks final validation boxes and moves this directory from `active/` to `validated/`. No placeholder completion or synthetic performance claims.
