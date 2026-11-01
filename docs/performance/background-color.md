# Composition background color investigation — 2026-11-01

The supplied `Trace-20261101T114818.json` records native compatibility
`mousemove` handlers lasting 47.3, 66.2, 60.0 and 48.6 ms. Their CPU samples
point to react-colorful's geometry reader. The 66.2 ms event contains a
65.0 ms style recalculation, with 650 affected elements, directly beneath that
reader. The application's pointer handler had already sampled the color,
updated its local controls and published an imperative GPU preview before the
widget's second mouse pipeline read the same surface again.

`ColorPalette` now owns mouse, pen and touch sampling through its existing
pointer lifecycle and captures the pad rectangle once at gesture start. It
prevents the embedded widget's compatibility mouse/touch pipeline from starting.
The genuine widget retains its appearance, accessible slider and keyboard
behavior; pointer start explicitly focuses that slider without scrolling.
Held saturation/value previews update that existing widget's thumb, color,
alpha swatch and accessible value imperatively. They publish local React state
once at release, instead of rerendering the palette and the widget's mirrored
state for each packet. A focused React Profiler regression requires zero local
color commits during these pointer samples.
The existing synchronous final sample, stale-effect retirement, cancellation,
canonical commit and undo behavior remain in place.

The recording also contains 219.7–338.3 ms pointer releases dominated by React
development task/measurement work, plus React DevTools geometry measurement.
Those durations are not a production benchmark of the commit path. A separate
1.13-second Three.js animation callback precedes the first recorded pointer
press by approximately two seconds; it is not attributed to opening this picker.

## Native verification

The maintained witness is
[`background-color-performance.spec.ts`](../../test/browser/background-color-performance.spec.ts).
It opens the composition background Inspector through three actual native canvas
press/releases, then sends 24 native saturation/value drag packets. Its capture
listeners are installed before the application imports. It records generated
event timestamps, dispatch, and the first/second RAF opportunities after the
canvas render counter advances; a later native packet may supersede an earlier
one. These opportunities are not INP, exact per-color GPU acknowledgment or
physical display timestamps. Opening requires the actual Background heading.

Both cohorts use the same 1200 × 900 composition with 30 rectangles, Chrome
156.0.8078.79 on Linux, a 1600 × 1000 viewport at DPR 1 and a native Intel Xe-LPG
WebGPU adapter. They run serially at low process/I/O priority, with a one-core
CPU quota, 1800 MiB memory-high, 2400 MiB memory-max and no scope swap. Chrome
can register its main process in a separate desktop scope, so these limits do
not establish a cap on its entire process tree. The workstation remains shared.

The standard TanStack/Vite production baseline and matching maps are frozen.
The candidate source tree reconstructs that exact baseline from its retained
diff and matching source-map contents, and changes only `ColorPalette.tsx`.
Unrelated in-progress gradient and rendering changes are excluded. Workloads,
raw reports, source provenance, compiled bundles, maps and diagnostic failures
are retained under ignored `artifacts/background-color-performance/`.
The final workspace has a subsequent one-line localization change to the live
accessible value: it uses the existing translated saturation/brightness label.
The measured candidate maps and this follow-up diff remain separate.

| Native observation                                               |          Before | Imperative candidate |
| ---------------------------------------------------------------- | --------------: | -------------------: |
| Background opening, capture → first useful RAF, median / max (3) | 80.6 / 199.6 ms |      95.8 / 114.3 ms |
| Drag, capture → first canvas-advance RAF, median / max (24)      |  19.5 / 91.7 ms |       20.3 / 73.1 ms |
| Drag, capture → second RAF, median / max (24)                    | 38.1 / 104.9 ms |       56.1 / 99.8 ms |
| Drag, generated timestamp → capture, median / max (24)           |  13.6 / 63.6 ms |       11.9 / 56.2 ms |
| Widget geometry reads during 24 drag packets                     |              24 |                    0 |

These small samples establish removal of the redundant read/render path, not a
repeatable overall speedup or universal smoothness. The candidate's median
second-RAF observation is worse. The earlier compatibility-event-only trial
also failed to establish an improvement (72.6 / 228.0 ms median/max second RAF)
and is retained separately as `after-react-native.json`.

Both final cohorts retain all five actual outer-editor React counters throughout
the drag and record zero production WebGPU, WebGL and Canvas2D pixel reads.
Release produces one canonical transaction and exact undo. A genuine canvas
screenshot decodes to the expected background pixel `[82, 62, 15, 255]` in both
cohorts. Native hue/alpha GPU checks also pass on the imperative candidate.
The immediate-release witness exposed separate test assumptions: an implicit
French locale and whole-degree expected hue despite the genuine 0.1-degree
slider step. Those expectations are now explicit and precise; the coordinator
owns the final integrated rerun of that corrected witness.

## Remaining live-development lag

The initial changes did not resolve the user's visible lag. A subsequent native
Chrome development trace uses the actual seeded two-artboard Explorations
project, with its eight text/shape layers. During 18-packet streams, the canvas
acknowledgment marker jumps from early revisions directly to the post-release
revision. The early timing prototype sampled `sceneRevision` in a microtask
queued by the capture listener, which can execute before the application's next
native listener. Its 407–607 ms waits therefore do **not** establish latency for
the current input's color. The later `dev-final-untraced/` prototype has the same
clock flaw and is excluded from final input-latency claims. The corrected driver
observes actual `data-scene-revision` mutations after the application writes them.

The renderer reports 59 prepared frames from 68 submissions, but almost all of
these prepared previews become obsolete before their display acknowledgment. The display
adapter protected a prepared, unpresented playback frame while continuing to
reject superseded property previews. Consequently finishing GPU preparation
did not establish a correctly acknowledged preview during the stream. This
marker alone does **not** prove that the pixels froze: the prepared GPU texture
is already bound when a later display callback rejects its revision. Native
screenshots completing while input continues are required for the pixel witness.

Certified paint previews now use the same bounded display handoff: finish and
display one admitted frame, then consume only the latest queued sample. An
opaque token certifies a contiguous page background/gradient or layer
fill/stroke/gradient scope. Changing the canonical project, base page/Motion
source, selection, owner, property scope or preview lifetime retires the token.
Cancel, commit and a following gesture cannot revive an old frame. Arbitrary
geometry, effects, structural/vector-source edits and transport previews keep
their existing strict stale-result rejection.
Mixed transform, creation and 3D flat-source gestures also retire certification.
SVG fills that additionally disable preserved vector colors, and GLB fills that
disable original model materials, remain excluded: those controls submit
source/material companion fields rather than one of the certified scalar paint
scopes. This scheduling correction does not claim equivalent throughput for
those source-changing edits.

The picker also had explicit 55 ms linear CSS transitions on its SV pointer and
both Radix channel-thumb wrappers. These delayed the visible pointer independently
of React and the authored value. All picker thumbs now track the current sample
without that second animation clock. The native hue/alpha witness requires zero
transition duration, and `color-live-presentation.spec.ts` requires multiple
actual canvas draw acknowledgments before each SV/hue/alpha release, together
with stable canonical values and React counters, one commit/undo and zero reads.

The initial live-development trace and CPU profile are retained in
`artifacts/background-color-performance/dev-current/`. Their traced durations
are diagnostic, separate from the earlier frozen production cohort; they are
not evidence of final post-correction latency.
This development diagnostic uses a two-core quota, 1800 MiB memory-high and
2600 MiB memory-max with no scope swap. Its native pointer releases take
103.6–298.9 ms in the trace; sampled work includes React's development JSX
construction and performance measurements. These traced costs remain distinct
from the subsequent untraced observations and the separate React leaf audit.

An early opening diagnostic exposed a separate canvas-hover clock bug: native
RAF functions had been stored on an object and then invoked with the wrong
receiver. Its failures are retained and the owner corrected the workspace clock
with arrow adapters. The controlled cohorts use identical direct native canvas
press/releases, without a preceding hover move, so that unrelated bug does not
confound their opening samples.

## Accepted live-pixel witness

`dev-final-pixels/` records the corrected native pixel witness on the frozen
development checkout under `artifacts/editor-paint-final/review/`: HEAD
`e2c8014` plus the coordinator's 72 deliberately staged owned files, excluding
unrelated live work. Shared dependency assets are served read-only; workspace
package links resolve inside that checkout. The native renderer reports WebGPU
with the actual Intel Xe-LPG adapter, Chrome 156.0.8078.79, 1600 × 1000 at DPR 1.
This is an independently identified executable, not a causal comparison with
the earlier live-worktree trace.

Each channel sends 60 genuine native packets, paced toward 16 ms; actual stream
durations are 1.18–1.28 seconds on the bounded shared workstation. Two full
viewport screenshots are requested asynchronously while packets continue. They
complete after packets 14–16 and 30 respectively, with another 30–46 actual
native packets delivered afterward and before release. The PNGs are decoded in
a separate inspection page after the gestures. Independent external decoding at
the same canvas-region point `(100, 186)` confirms the following displayed pixels:

| Channel                         | First RGB     | Second RGB    |
| ------------------------------- | ------------- | ------------- |
| Saturation/value                | 178, 160, 121 | 151, 131, 84  |
| Hue                             | 31, 74, 15    | 15, 74, 44    |
| Alpha, over the canvas backdrop | 89, 77, 117   | 119, 110, 141 |

All five outer-editor commit counters and their actual DOM owners remain stable
while held. There are no viewport resizes, window blurs, owner replacements or
canonical edits during the streams. One ordinary focus handoff between hue and
alpha thumbs stays inside the same color control and causes no cancellation.
Each release creates exactly one changed canonical edit. All six genuine
Solid/Gradient radio activations also toggle canonical `backgroundGradient`
presence exactly as requested. Browser errors and instrumented production pixel
reads are zero. These are correctness/presentation observations, not a frame-rate
or latency benchmark under screenshot encoding.

The rejected clipped-capture experiment remains in `dev-final-diagnostic-v2/`.
Its trace proves that concurrent 4 × 4 captures temporarily changed the document
layout to 4 × 4, dispatched resize/blur, mounted the responsive editor and
cancelled SV input. Its changing pixels and SV React fanout are therefore not
accepted as evidence about the product's normal drag. Full viewport capture
avoids that emulation change. The rejected 404 server startup, dependency-font
403 and late-capture experiments are also retained rather than hidden.

## Corrected native clocks and mode-switch experiment

The corrected clock associates each native input with the subsequently observed
`data-scene-revision`, then waits for `data-rendered-revision` to reach that
request or a newer one. MutationObserver time is **delivery time**, not the exact
dataset setter or GPU submission time: synchronous UI work can postpone it.
The resulting input-to-draw-marker boundary includes browser scheduling and
rendering, but does not establish physical display latency or INP.

The unhooked, screenshot-free `dev-final-clock/` cohort used the coordinator's
86-file frozen development source. Capture-to-draw-marker median/max was
36.4/118.5 ms for SV, 27.7/71.2 ms for hue and 34.1/80.1 ms for alpha.
Six actual mode activations took 73.7–109.0 ms. Later global Inspector fixes
changed that source, so those observations are not a color-only causal speedup.

The user still reported mode stutter. `mode-97-before/` therefore establishes a
fresh baseline after the global UI fixes, with exactly six genuine radio
activations and canonical `backgroundGradient` presence checked each time.
The pre-bootstrap React 19 diagnostic in `mode-97-before-diagnostic/` identifies
repeated Solid/Gradient subtree replacement: 590 worked function/memo fibers on
each Gradient activation and 466 on each Solid activation. Gradient editor
inclusive React durations were 62.1, 50.0 and 30.3 ms; its presets, fields and
Radix controls were rebuilt. Inclusive timings overlap and must not be summed.

The candidate preserves only previously visited background panes for the current
owner using React 19 [Activity](https://react.dev/reference/react/Activity).
It does not mount an unvisited gradient editor at startup. Hidden effects detach;
focused controls, pending sampling and open portals are discarded rather than
cached. Page/project changes, engine replacement and actual load events retire
both panes, including same-ID loads with identical authored colors. Layer paint
controls retain their previous lifecycle. A distinct semantic key for each pane
prevents sibling identity collisions.

`mode-100-after/` differs from the frozen 97-file baseline by exactly
`Inspector.tsx`, `GradientControl.tsx` and the new `retained-paint.tsx` helper.
The manifest, three source copies, reviewed patch, loaded Vite modules and raw
reports are retained with the captures. Both unhooked cohorts use Chrome
156.0.8078.79, the actual Intel Xe-LPG WebGPU adapter, 1600 × 1000/DPR 1, a 200%
CPU quota, low process/I/O priority, 1800/2600 MiB memory limits and no scope swap.
No tracing, React hook or screenshots run during their inputs.

| Native activation      | Before, ms | Retained panes, ms |
| ---------------------- | ---------: | -----------------: |
| Gradient, first visit  |      282.6 |              169.3 |
| Solid, first return    |      197.4 |              137.4 |
| Gradient, second visit |      237.4 |              130.1 |
| Solid, second return   |      203.2 |              101.3 |
| Gradient, third visit  |       66.6 |              115.9 |
| Solid, third return    |      180.0 |               70.8 |

These values run from native pointerdown capture to the draw marker for the
resulting click. The six-sample median is 200.3 ms before and 123.0 ms after.
They show a useful improvement, with one slower Gradient sample, and remaining
70.8–169.3 ms costs. They do not establish universal smoothness or a production
latency percentile.

The matched React diagnostic in `mode-100-after-diagnostic/` confirms React DOM
19.3.1 and R3F 9.8.2. Gradient editor inclusive durations fall to 35.0, 24.8 and
12.5 ms. Total observed fibers do **not** fall: hidden panes can receive deferred
updates, and later switches report 646 worked fibers. Activity trades bounded
retained DOM and deferred work for less foreground reconstruction; it is not a
claim that React stops working. Both native cohorts instrument 417 actual
geometry reads across the full gestures/switches and zero GPU/WebGL/canvas/video
pixel reads. The candidate preserves the same idle DOM nodes across all six
switches, hides the inactive pane, makes exactly one canonical commit per switch,
and reports zero browser errors or gesture disruptions.

Focused lifecycle regressions cover effect disconnect/reconnect and disposal,
focused draft cancellation, genuine Radix portal cleanup, sampling abort and
late-result rejection, owner replacement, same-ID load, and real Inspector keys.
The coordinator ran these checks and the Inspector/numeric regressions, including
ruler-only draft preservation and history invalidation.

## Retain unchanged paint during layer edits

The later visibility trace also exposed reconstruction of background stop rows
and solid color controls after unrelated layer edits. A shared imperative paint
scope now separates canonical draft invalidation from React owner changes.
Layout-committed callbacks keep the current command guards; semantic owners and
load epochs retire stale controls. Background paint receives stable props, so
visibility, transform and effect history do not render its unchanged stop rows.

Focused regressions exercise the actual palette/stop components, ruler-compatible
drafts, stale angle cancellation, same-ID loads and native sampling. Local color
overrides are retired on canonical adoption, so undo updates the actual palette
as well as its hexadecimal field. See the [visibility investigation](visibility.md)
and [history measurements](undo-redo.md) for the later accelerated cohorts. Those
sources include these additional changes and are separate from the paired
97/100-file mode experiment above.
