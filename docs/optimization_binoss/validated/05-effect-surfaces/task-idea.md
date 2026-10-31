# 05-effect-surfaces: Reuse bounded effect scratch and backdrop targets

Priority: P2. Status: validated by coordinator; archived.

## Observed problem

GpuEffects owns one scratch target and one backdrop target. Alternating effect layers of different dimensions resizes the same targets repeatedly. Three RenderTarget.setSize disposes changed allocations, causing avoidable churn in animated scenes.

## Required result

Use a small explicitly budgeted reusable pool by compatible dimensions/format, or an equivalently correct reuse strategy. Respect pass lifetimes and prevent GPU feedback/aliasing. Keep projected/current byte accounting accurate, enforce limits, and explicitly dispose pooled targets. Preserve source-local logical dimensions, filtering, alpha and multi-stage effects.

## Owned paths and dependencies

packages/render/src/effects/GpuEffects.ts and new effects/shared pool helper; focused effect pool tests/native witness. Shared cache APIs remain unchanged unless handed off.

## Shared execution rules

- Read the root AGENTS.md instructions and relevant architecture contracts before edits. Core stays pure TS; render owns native Three/TSL/GPU resources; UI uses existing Jotai/Motion/i18n patterns.
- One agent owns this task. One writer per file. Ask the coordinator before touching another task's files or shared interfaces.
- Do not stage, commit, push, rewrite history, edit the shared changelog, or touch unrelated dirty work. Provide an English changelog bullet in the completion handoff.
- Add meaningful focused regressions, but **do not run tests, builds, typechecks, lint or browser cohorts**: `/root` is the sole integrated validation owner. No extra subagents.
- Keep files below 600 lines. Report actual changed paths and proposed commands; worker completion is `implementation ready`, never `validated`.
- The coordinator reviews source changes, runs focused tests and native witnesses serially with bounded resources, and resolves failed acceptance checks through the owner.
- Only the coordinator checks final validation boxes and moves this directory from `active/` to `validated/`. No placeholder completion or synthetic performance claims.
