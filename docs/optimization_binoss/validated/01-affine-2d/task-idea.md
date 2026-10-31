# 01-affine-2d: Preserve affine 2D transforms when changing hierarchy

Priority: P1. Status: validated by coordinator; archived.

## Observed problem

A scaled parent currently loses its contribution when its child is ungrouped or reparented. The reviewed engine reproduction changed the child world matrix from [2,0,0,1.5,40,75] to [1,0,0,1,120,110] on ungroup and [1,0,0,1,40,75] on reparent. Rotation plus nonuniform scaling can introduce shear, so decomposing only rotation/translation is insufficient.

## Required result

Implement one lossless affine hierarchy contract for classic layers, preserving existing portable documents and the native spatial basis contract. Preserve world placement, scale, reflection and shear for reparent/ungroup, nested groups, masks, selection bounds and rendering. Do not silently approximate an unrepresentable transform. Keep validated commands, atomic failure, undo/redo and legacy identifiers.

## Owned paths and dependencies

packages/core/src/layers/{commands,grouping,geometry}.ts; packages/core/src/document/{model,validation}.ts for Layer affine representation; focused core tests. Any renderer/UI adaptation needs an explicit file handoff.

## Shared execution rules

- Read the root AGENTS.md instructions and relevant architecture contracts before edits. Core stays pure TS; render owns native Three/TSL/GPU resources; UI uses existing Jotai/Motion/i18n patterns.
- One agent owns this task. One writer per file. Ask the coordinator before touching another task's files or shared interfaces.
- Do not stage, commit, push, rewrite history, edit the shared changelog, or touch unrelated dirty work. Provide an English changelog bullet in the completion handoff.
- Add meaningful focused regressions, but **do not run tests, builds, typechecks, lint or browser cohorts**: `/root` is the sole integrated validation owner. No extra subagents.
- Keep files below 600 lines. Report actual changed paths and proposed commands; worker completion is `implementation ready`, never `validated`.
- The coordinator reviews source changes, runs focused tests and native witnesses serially with bounded resources, and resolves failed acceptance checks through the owner.
- Only the coordinator checks final validation boxes and moves this directory from `active/` to `validated/`. No placeholder completion or synthetic performance claims.
