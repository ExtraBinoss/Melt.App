# 03-reflection-admission: Separate reflection capture budgets from receiving materials

Priority: P2. Status: validated by coordinator; archived.

## Observed problem

SceneReflections passes only capture-admitted meshes to probe selection and material binding. A large mesh omitted by the triangle budget can therefore lose scene reflections, even when it is a valid document object. Balanced capture currently permits 250,000 triangles.

## Required result

Represent capture contributors and reflection receivers separately. Bound capture cost while retaining valid reflective GLB/text/shape receivers; preserve self exclusion, shared probes, original material ownership, deformation/instances, cancellation and cleanup. Surface actual omissions in existing diagnostics without adding unnecessary UI text.

## Owned paths and dependencies

packages/render/src/spatial/reflections/**; focused reflection tests and native large-GLB witness. No scene, compositor or shared cache edits without handoff.

## Shared execution rules

- Read the root AGENTS.md instructions and relevant architecture contracts before edits. Core stays pure TS; render owns native Three/TSL/GPU resources; UI uses existing Jotai/Motion/i18n patterns.
- One agent owns this task. One writer per file. Ask the coordinator before touching another task's files or shared interfaces.
- Do not stage, commit, push, rewrite history, edit the shared changelog, or touch unrelated dirty work. Provide an English changelog bullet in the completion handoff.
- Add meaningful focused regressions, but **do not run tests, builds, typechecks, lint or browser cohorts**: `/root` is the sole integrated validation owner. No extra subagents.
- Keep files below 600 lines. Report actual changed paths and proposed commands; worker completion is `implementation ready`, never `validated`.
- The coordinator reviews source changes, runs focused tests and native witnesses serially with bounded resources, and resolves failed acceptance checks through the owner.
- Only the coordinator checks final validation boxes and moves this directory from `active/` to `validated/`. No placeholder completion or synthetic performance claims.
