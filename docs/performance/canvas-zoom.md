# Infinite canvas zoom and selection planes

The warm native cohort uses Linux / Chromium 156.0.8078.4, WebGPU on Intel Xe-LPG,
1600 × 1000 CSS pixels, DPR 1. One worker runs at nice=15 inside CPUQuota=100%,
MemoryHigh=1700M, MemoryMax=2400M, MemorySwapMax=0. The scope includes the native
browser and input producer. Sixty trusted Ctrl+wheel packets are requested at
120Hz; Chromium may coalesce delivery. Each case starts from Fit, separately with
and without selection, with the same initial/default two-composition project.

Before: production main `09da4b0`. After: main `d4be024` plus the reviewed changes,
compiled from tree `fc0ade2fa4696c87f25d5dcd0975302cbe629480`. The later main includes
previously published composition-retention/profiling changes; these measurements
compare complete builds and are not causal attribution to one isolated function.
Matching compiled JavaScript/source maps remain in
`/tmp/melt-canvas-zoom-review/artifacts/canvas-zoom-production`. The final reviewed
tree is recorded in ignored `artifacts/canvas-zoom/frozen.json`.

The probe retains native event timestamps, delivery clocks and computed camera
poses at RAF opportunities. It matches the first changed pose after delivery and
the following RAF. These are conservative browser presentation proxies, not INP
or physical-display timestamps. The native input control uses the same browser,
viewport, scope, modifiers, producer and probe, with one minimal CSS-transform box
and no editor/GPU engine. Raw reports and the exact producer are retained in
`artifacts/canvas-zoom/` (`profile.ts`, before-normalized.json, delivered.json,
control.json and summary.json). These short stress cohorts are not a guarantee of
frame rate across machines or arbitrary documents.

| Case            | Delivered packets before / after | Input queue p95 before → after | Native input → second RAF p95 before → after | RAF gap p95 before → after |
| --------------- | -------------------------------- | ------------------------------ | -------------------------------------------- | -------------------------- |
| No selection    | 33 / 58                          | 131.9 → 25.3 ms                | 165.1 → 58.4 ms                              | 33.4 → 16.7 ms             |
| Selected object | 31 / 33                          | 639.6 → 292.7 ms               | 736.0 → 322.3 ms                             | 83.3 → 66.6 ms             |

The minimal control delivers 60 packets, with 16.7ms p95 RAF gaps. The selected editor still has larger gaps in this one-core stress cohort; the reports retain that limit rather than presenting it as a universal 60fps result.

## Changes and attribution

A separate instrumented CPU/timeline capture maps about 503ms of sampled wall time
to `ViewMotion.begin → constrain → getBoundingClientRect`, after synchronous zoom
sampling had already written styles. Tracing and CPU quotas affect those totals;
they are diagnostic attribution, not the untraced latency cohort above.

Viewport dimensions are now measured at input/resize boundaries and cached for
constraints during animation. Wheel navigation owns one nearby target, bounded
to 18% ahead of the visible pose. It interpolates once per RAF, caps the simulated
frame delta at 32ms and completes its quiet tail after 64ms of frame progress.
Late packets cannot build a distant animation backlog; reversal drops the old
direction, and interruption retains the last visible pose. Fit and discrete zoom
controls keep their own animation. Reduced motion remains direct. One settled
React publication follows a completed wheel gesture.

Canvas/selection layout and style are contained locally. All handles on one frame use the same black or white ink, estimated from authored
fill, alpha, gradient or a bounded vector palette. Their rounded shape uses the
shared radius token. This applies while idle and during camera movement, with no
per-handle backdrop filters or production pixel reads. Editing decorations live in a separate,
noninteractive camera-aligned plane above composition chrome. Only handles accept
pointer input; body-portalled menus remain above the plane. Camera updates remain
imperative, and owned subscriptions/RAF work are released on disposal.

## Regression checks

Focused tests cover a 200-packet burst, a simulated one-second stall, direction
reversal, pointer-anchor preservation, interruption, cancellation, reduced motion,
no animation-frame viewport reads and one settled publication. A native two-board
case records real wheel input and rejects per-frame zoom changes above 19%; its
observed maximum ratio is approximately 1.156. A separate native case places real
resize handles over the composition heading/menu and mode switch, performs resize
and undo, and checks that empty overlay space and menus remain usable.

## Side resizing

All four edges expose handles and reuse the existing transform gesture, preview,
snapping and single-commit undo path. A side changes only its own axis; Shift uses
that axis for proportional shrinking or growing. Opposite edge midpoints and corner
anchors are solved using the layer transform, including mirrored/nonuniform scales
and transformed parents. Dense or unusually large vector palettes use the declared
paint fallback rather than parsing unbounded paths for decoration contrast.
