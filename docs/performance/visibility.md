# Visibility control investigation

The supplied `Trace-20261101T133119.json` records the live development editor at
`http://localhost:6100` on 1 November 2026. Both Inspector and layer-row visibility
controls use validated layer commands. The trace identifies unnecessary React work
around those commands; it does not establish a GPU composition bottleneck.

## Supplied trace

The eight click dispatches start 5.784, 6.609, 7.465, 8.648, 10.078, 11.201,
12.311 and 13.279 seconds after the recording's initial breadcrumb. Their main
thread durations are respectively 391.647, 379.718, 538.930, 432.690, 477.577,
506.957, 421.572 and 409.987 milliseconds. Sampled application stacks associate
the first four with Inspector `onCheckedChange` and the last four with the layer
row action. Engine command/publication stacks occupy approximately 4–11 ms in
the sampled click windows.

Each click includes 6,528–6,614 `V8Console::runTask` entries and thousands of V8
debugger async-task entries. React development JSX/task creation and render
instrumentation dominate the sampled stacks. React DevTools' `installHook.js`
also measures host instances and forces style/layout work. These are diagnostic
recordings with developer tooling active: nested task durations are inclusive
and must not be summed into exclusive CPU time or treated as production latency.
The initial 4.358-second pointer-out overlaps CPU-profiler startup and is excluded
from visibility-click comparisons. V8 sample deltas include negative values, so
naive delta-weighted profile percentages are not reliable for this recording.

Application frames show unchanged background-gradient stop rows, numeric inputs,
tooltips and timeline controls being rebuilt after a visibility change. In
particular, `BackgroundGradientControl` forwarded the changed composition object
and fresh callbacks into the complete paint editor even when its authored paint
was unchanged. The solid color control had the same unnecessary child rendering.
Retaining unchanged paint controls therefore addresses concrete work visible in
the trace while allowing document changes to invalidate active drafts.

## Native diagnostic and follow-up

The ignored driver is `artifacts/visibility-performance/driver.ts`. It launches
`/opt/google/chrome/chrome`, uses a 1600×1000 viewport at DPR 1, installs the actual
readback-API probe before navigation, and generates trusted native clicks. It
records generated-event time, capture/dispatch time, engine duration, canonical
renderer acknowledgment and the second following animation frame separately.
The latter is a presentation opportunity, not a physical display timestamp.

The partial baseline `artifacts/visibility-performance/before-v2/failure.json`
contains six image-layer eye-button samples and six Inspector-switch samples.
Row dispatch-to-canonical acknowledgment ranges from 53.2 to 152.8 ms; Inspector
samples range from 75.8 to 222.9 ms. Synchronous engine execution ranges from 1.3
to 4.6 ms. The twelve toggles and their exact undo/redo checks passed. A later
24-layer fixture could not locate its virtualized row after reusing a page ID;
the browser closed and that attempt remains a partial diagnostic. Its failure
report did not retain the adapter identity, so it is not a verified hardware
timing cohort. Unique page IDs correct that fixture issue.

The final focused check used `PROFILE_GRADIENT=1` for a rounded image and an
active three-stop background gradient, with six clicks per control. It verifies
one layer command and revision per click, unchanged background paint, exact
undo/redo values, zero production JavaScript pixel readbacks, actual adapter
identity, and the Inspector's computed 12 px/14 px visibility spacing. It runs
serially in a scope limited to 200% CPU, MemoryHigh 1800 MB, MemoryMax 2600 MB and
zero swap, with nice 15 and ionice class 2/priority 7. The baseline and final
fixtures differ; no causal percentage improvement should be claimed from them.

The final check passed against the frozen 115-source overlay at port 6207.
`artifacts/visibility-performance/final115/` retains the raw report, loaded-source
bodies, counters and GPU statistics. The browser was Chrome
156.0.8078.79; the actual WebGPU adapter reported Intel `xe-lpg`. All four
instrumented production readback counts were zero. No browser errors, resize,
navigation or HMR disruptions occurred.

| Native control       | Dispatch → canonical draw, median / range | Dispatch → second RAF, range |
| -------------------- | ----------------------------------------- | ---------------------------- |
| Inspector visibility | 55.15 ms / 29.2–65.4 ms                   | 62.1–95.0 ms                 |
| Layer-row eye        | 137.65 ms / 57.5–264.3 ms                 | 77.1–306.8 ms                |

Synchronous engine execution ranged from 0.8 to 5.6 ms. App, CanvasArea and
EditorScene counters stayed fixed during the clicks; Inspector and EditorCanvas
each committed once per document change. These counters complement the measured
draw boundary and do not establish responsiveness by themselves. The layer-row
case still contains three 212–264 ms draw acknowledgments, so this result does
not establish uniformly immediate feedback for that control.

Both controls passed six exact undo and redo checks, including an empty undo
stack after undoing the six clicks. Background paint remained unchanged. Genuine
canvas screenshots `image-visible.png` and `image-hidden.png` show the rounded
image appearing and disappearing over the same gradient. Computed margins and
measured element gaps were both exactly 12 px above and 14 px below the Inspector
visibility row; `spacing.json` preserves those values.

## Bounded thumbnail admission check

A four-click row-only diagnostic instrumented the actual
`ThumbnailPreviews.prototype.render` calls against the same frozen source. Three
real preview jobs were observed; each began with the canvas canonical revision
equal to the engine revision. None overlapped a measured click's dispatch-to-draw
window. Those four draw acknowledgments were 53.7, 45.5, 30.9 and 29.4 ms, so the
earlier slow samples did not reproduce in this diagnostic. The separate
`ThumbnailRenderer` wrapper observed no calls, causing the driver's stricter
instrumentation assertion to fail; this remains diagnostic evidence rather than
an additional passing verification. The report is retained under
`artifacts/visibility-performance/jobs115/`.

The existing runtime injects `createRenderActivity(engine)` into
`ThumbnailActivity`; its suspension blocks visible previews while the current
canonical canvas revision is pending. Ignoring the general quiet timer therefore
does not by itself demonstrate that thumbnails preempt the canvas. The observed
jobs do not justify adding a new delay or presentation gate, and the cause of the
three earlier row outliers remains unproven.
