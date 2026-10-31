# 02-spatial-opacity: Make partial native-layer opacity reveal geometry behind it

Priority: P1. Status: validated by coordinator; archived.

## Observed problem

A native front object at layer opacity 0.5 still writes opaque shared depth. On WebGPU and WebGL the center pixel stayed [228,127,144,255] when the rear object changed from green to blue. At opacity zero, the rear colors were correctly [46,183,93,255] and [0,49,208,255]. Layer/group alpha currently enters too late in compositing.

## Required result

Implement a documented generic depth/contribution rule for fractional layer and ancestor opacity, independently from material alpha, masks and shading-only selection context. Preserve opaque cross-object occlusion and ordinary group isolation. Do not fake transmission, introduce pixel readbacks, or merely special-case one object/template. Coordinate native transparent ordering and export behavior.

## Owned paths and dependencies

packages/render/src/spatial/scene/{CompositionScene,DepthBindings}.ts and new scene helpers; focused native opacity regression. Exclusive ownership precedes task 04.

## Shared execution rules

- Read the root AGENTS.md instructions and relevant architecture contracts before edits. Core stays pure TS; render owns native Three/TSL/GPU resources; UI uses existing Jotai/Motion/i18n patterns.
- One agent owns this task. One writer per file. Ask the coordinator before touching another task's files or shared interfaces.
- Do not stage, commit, push, rewrite history, edit the shared changelog, or touch unrelated dirty work. Provide an English changelog bullet in the completion handoff.
- Add meaningful focused regressions, but **do not run tests, builds, typechecks, lint or browser cohorts**: `/root` is the sole integrated validation owner. No extra subagents.
- Keep files below 600 lines. Report actual changed paths and proposed commands; worker completion is `implementation ready`, never `validated`.
- The coordinator reviews source changes, runs focused tests and native witnesses serially with bounded resources, and resolves failed acceptance checks through the owner.
- Only the coordinator checks final validation boxes and moves this directory from `active/` to `validated/`. No placeholder completion or synthetic performance claims.
