# 06-incremental-transactions: Make local command transactions scale with touched domains

Priority: P2. Status: validated by coordinator; archived.

## Observed problem

prepareTransaction scans IDs across every page and validates the entire project after every local commit. createCommandDraft has a small single-command allowlist; multi-command transactions fall back to cloning the whole project. This breaks unaffected identities and forces downstream recompilation/cache work.

## Required result

Introduce explicit typed command mutation/validation scopes and safe structural sharing for supported local commands and batches. Maintain a trustworthy durable-ID index/reservation contract and incremental validation for certified engine documents; external imports still receive full validation. Unsupported structural cases must conservatively fall back. Preserve cross-domain invariants, transaction atomicity, history, journals and concurrency/stale reservation rejection. Do not remove validation for speed.

## Owned paths and dependencies

packages/core/src/session/**; new document validation helpers and relevant focused tests. Start after task 01 releases document/validation.ts if that file is needed. Do not edit motion/property implementation owned by task 07.

## Shared execution rules

- Read the root AGENTS.md instructions and relevant architecture contracts before edits. Core stays pure TS; render owns native Three/TSL/GPU resources; UI uses existing Jotai/Motion/i18n patterns.
- One agent owns this task. One writer per file. Ask the coordinator before touching another task's files or shared interfaces.
- Do not stage, commit, push, rewrite history, edit the shared changelog, or touch unrelated dirty work. Provide an English changelog bullet in the completion handoff.
- Add meaningful focused regressions, but **do not run tests, builds, typechecks, lint or browser cohorts**: `/root` is the sole integrated validation owner. No extra subagents.
- Keep files below 600 lines. Report actual changed paths and proposed commands; worker completion is `implementation ready`, never `validated`.
- The coordinator reviews source changes, runs focused tests and native witnesses serially with bounded resources, and resolves failed acceptance checks through the owner.
- Only the coordinator checks final validation boxes and moves this directory from `active/` to `validated/`. No placeholder completion or synthetic performance claims.

## Agreed scene Motion integration from task 07

Task 07 adds `CompositionMotion.sceneProperties`, separate from legacy layer
tracks. Its properties and keys have durable IDs that the session allocator must
reserve alongside legacy property/key IDs. Commands mutating these arrays require
an owned mutable draft and correct freeze/publication/undo semantics. The existing
`upsertMotionKeyframe` accepts a separate explicit scene target; legacy
`MotionPropertyTarget` remains unchanged. Do not omit scene channels from any new
validation certificate, ID cache or batch draft. Task 07 owns pages command pruning
and clipboard page/light target remapping; coordinate shared interfaces through
`/root`.
