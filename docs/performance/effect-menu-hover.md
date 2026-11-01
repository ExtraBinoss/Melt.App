# Effect and adjustment menu pointer feedback

## Implementation

The reproduction uses a photographic image selected in the editor, Layers’ **+**,
the first **Add effect** hover, and switches between effects and adjustments.
One native Radix submenu now owns both categories. Switching preserves its portal,
positioned surface and search/family drafts instead of replaying the entrance.
Only visited categories are retained, using React Activity for the inactive one.

Catalog rows reuse the bounded virtual-list implementation. Visible rows and a
small overscan mount genuine Radix menu items. Navigation addresses the complete
logical catalog: arrows, Home/End, PageUp/PageDown, localized typeahead and search
keyboard transfer can reach entries outside the mounted window. The focused row
stays mounted during pointer scrolling. The closed family filter opts out of
prewarming to avoid preparing another controller tree during catalog opening.

The pinned Radix menu dependency previously read every item’s DOM text and
published another state update even when `textValue` was supplied. The Bun patch
skips that work for explicit labels, preserving the DOM-text fallback. Both ESM
and CommonJS distributions are patched; obsolete upstream source-map references
are removed so the bundler maps the actual patched source. Explicit typeahead
labels and fallback labels have regression checks.

Category pointer intent bypasses the delayed native submenu timer and its stale
diagonal corridor. Native pointermove supplements pointerenter when a concurrent
trigger replacement swallows an enter. A cancellable focus frame consumes only
its own request, preventing an old frame from stealing a newer category’s focus.
Pointer and keyboard highlighting are exclusive within the two category rows.

A shared hover-dismiss hook provides a 200 ms exit grace across the trigger and
portaled content. Reentry, keyboard use and unmount cancel it. Nested filter menus
remain owned by the surface. No global pointer listener is installed.

The separate selection milestone removes deferred attachment presentation from
the Layers action header. The add button becomes available with selected-row
feedback while availability-based memoization and live command targets remain.
Browsing does not edit the document or render effect previews.

## Verification and measurement — November 1, 2026

Google Chrome for Testing **156.0.8078.4** ran headlessly on Linux at 1600 × 1000,
DPR 1, with the editor reporting its WebGPU backend. The fixture persists the real
`public/benchmark/50-waterfall-5.jpg` photograph in a 1920 × 1080 composition and
reloads that project before measurement. This prevents unrelated automation-demo
font preparation from contaminating the interaction window. Actual adapter
identity was not recorded, so these captures do not establish hardware GPU use.

The final functional cohort passed **5 native browser cases** and the focused
unit cohort passed **21 cases across 6 files**. Native checks cover retained
surface/drafts, keyboard activation and undo, non-primary rejection, immediate
selection availability, hover travel/dismissal and rapid exclusive highlights.
The cold selection milestone observed availability at its first RAF in **17.8 ms**.
The catalog probe observes zero item-label DOM reads when explicit labels exist.
Body inline pointer/overflow styles remain unchanged; five editor-root commit
deltas and instrumented GPU/WebGL/Canvas2D/VideoFrame pixel reads remain zero.

The trace attributed the cold mount to React/Radix construction and forced style
resolution rather than editor-root rerenders. In the diagnostic cohorts before
and after virtualization, the largest observed main-thread task was **407.5 ms**
and **324.6 ms**; one forced style update involved **111** and **66** elements.
These small development cohorts are diagnostic observations, not a controlled
production latency speedup. The latter trace precedes the dependency patch.

The final trace on the restarted development server still observed a **592 ms**
main-thread task. A separate unsampled run observed first useful panel
opportunities of **521.2 ms** for effects and **764.3 ms** for adjustments.
Those runs occurred with other rendering/development workloads and measurable
host memory pressure; React development instrumentation also appears in the
profile. They do not establish an instant cold opening or a final latency gain.
No production timing claim is made for the final implementation. Further
measurement was stopped at the user’s request after the passing functional
checks. Earlier frozen production timing samples belong to earlier code and are
not used as final results.

The probe begins at the earliest matching native pointerout/over/move packet,
because React can synthesize enter from pointerout. Hover feedback is observed
at a RAF with the actual hovered row and nontransparent background; a second RAF
after visible catalog geometry records a useful panel opportunity. These proxies
are neither INP nor physical display or GPU durations. Unchanged root commit
counters alone are not evidence of responsive input.

## Evidence and reproduction

Follow [the isolation protocol](protocol.md). The ignored
`artifacts/effect-hover.config.ts` selects Chrome for Testing and an existing
server, avoiding an implicit rebuild:

```sh
bunx playwright test test/browser/effect-menu-hover.spec.ts --config artifacts/effect-hover.config.ts --workers=1 --trace off
```

Ignored evidence lives in `artifacts/effect-hover/`: `browser-patched-dev.log`,
`patched-units.log`, native screenshots and JSON, and the
`cold-catalog-dev-trace`, `cold-catalog-virtual-trace`, `final-dev-trace` and
`final-dev-clean` cohorts. Trace stems include actual Chrome timeline JSON,
CPU profiles and clock correlations. The experimental
`--disable-vulkan-surface` flag produced blank GPU captures and its cohorts were
rejected. It is absent from the retained final runs.

The dependency patch was installed with the frozen offline lockfile. Port 6100
was restarted with `--force`, and its regenerated optimized dependency contains
the explicit-label guard. Other working-tree changes belong to concurrent work
and are excluded from this menu milestone.
