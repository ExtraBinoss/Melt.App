# Undo/redo notice validation — tasks 11–12

Validated on 2026-11-01 against camera milestone `c6799e2`, with only the reviewed history changes included in the commit.

## Result

The engine retains a frozen semantic description with each existing undo entry. Commit, undo and redo publish the matching optional `CommandCommitInfo.history`; the notice no longer reconstructs meaning from a current selection, page or parallel UI stack. This fixes the reported background-color edit being described only as Artboard, including history created before the notice mounted.

The exhaustive typed command registry delegates to domain collectors. Registered scalar names, units, scales and choices cover composition backgrounds/dimensions, layer paint/text/transforms, effect parameters/settings, SVG flags, 3D pose/material/scene owners, Motion values/timing, media, audio, guides and masks. Repeated writes aggregate first-before/final-after; separate key times and occurrences remain distinct. Explicit inactive-page targets use the actual owner. Descriptions retain at most 64 changes and 120 Unicode code points per display string, with truthful overflow/truncation flags. Large vector/morph/gradient contents are not copied into descriptions; structural changes have named actions. The durable journal format is unchanged.

Undo displays the restored before value and redo the reapplied after value. Twelve locale resources supply new notice semantics, with existing domain/effect labels registered explicitly. The formatter preserves meaningful numeric precision and percentage scaling. The existing pill geometry, animation, canvas centering, two-second lifetime, hover/focus pause, close button and accessibility remain intact.

## Checks actually run

- Integrated focused cohort: 18 test files, 95 tests. The first run passed 91 tests and identified one real unknown-command validation regression plus three assertion/fixture updates. The metadata registry now guards unknown and prototype names, preserving authoritative command errors. The affected three-file rerun passed 31 tests, resolving all four failures. After replacing a class-spread test adapter with an explicit typed port, its five tests passed again. These are overlapping reruns, not additional distinct tests.
- Existing engine, lightweight commit-info, prepared-transaction, draft, context and incremental validation regressions passed. New history tests cover all property families, transactions, inactive owners, late observation, branching/load/custom limits, failed/cancelled/stale changes, reentrant publication, immutable detached descriptions, Unicode bounds, bulk noops, overflow and retained updates after capacity. They also verify distinct keyed locations, registered effects, unchanged cloned morph recipes, actual mask ownership and media/audio processing.
- UI source, formatter, timer and notification interaction regressions passed. Formatter checks cover registered effect labels/choices and newly introduced notice resources in all twelve locales, plus deleted/inactive owners, compound/missing/mixed/empty/truncated values and compatibility fallback.
- Two real Chrome cases passed in 42.0 seconds test execution. The existing positioning/panel resize/project-name/ruler/hover/close/zoom checks passed in 28.6 seconds. The actual background HEX input, native keyboard undo/redo, numeric position and blur amount checks passed in 11.2 seconds. Expected values included Background #123456/#654321, Position X 200px/212.75px and Blur Amount 57%/25%. Existing production readback instrumentation reported zero GPU/WebGL/Canvas reads in the instrumented case.
- Strict pure-core TypeScript (no DOM, exact optional properties and unchecked index access), focused web/test TypeScript, type-aware Oxlint, ESLint, formatting, zero-rule checks and synchronized workspace version 0.2.0 passed. The final explicit test-port adapter received its own affected TypeScript check.

## Review corrections

The coordinator caught mostly unchanged bulk fields consuming the summary budget, cloned nested morph recipes being falsely marked as geometry, a wrong default mask owner, and media volume using the wrong label namespace before acceptance. Key locations were made explicit so edits at different times do not collapse into one invented value. Native test readiness checks match the intended project and completed revision.

## Environment and scope

Root was the sole validation owner. Workers implemented separate core/UI domains, prepared regressions and ran targeted formatting only. Heavy checks ran serially at low priority under one-CPU cgroup quotas, bounded heaps/memory and no swap. Browser checks used `/opt/google/chrome/chrome`, a 1600 × 1000 viewport, device scale 1 and the existing Vite server on port 6100. The ignored test harness filters HMR only in its owned contexts so concurrent unrelated edits cannot replace the executable mid-check. Test wall times are not production latency measurements.

Static/rules checks used an isolated review worktree containing exactly the owned source delta on `c6799e2` and the existing installation's dependency links. Unrelated in-progress video/backend, loading, export, navigation and profiling work was preserved and excluded. No checker exclusions, coverage ignores or weakened assertions were introduced. Full CI coverage, production build, GPU/storage load suites and release preparation were not run for this metadata-only iteration.

## Deliberate display limits

The pill shows the first named change with a real remaining-change count or overflow suffix. Structural geometry, gradient topology and animation-channel recipes use action names rather than serializing their data. Deleted owners remain nameable by semantic category; user-assigned owner names are not copied into metadata. Reference IDs are displayed as Assigned/Unset. Existing editor locale fallbacks remain unchanged. Exact rational times and undo state remain in the authoritative snapshots; summaries display time in seconds.

Evidence logs and browser output remain ignored under `artifacts/history-notices/`. Both task directories are archived under `validated/` after coordinator acceptance.
