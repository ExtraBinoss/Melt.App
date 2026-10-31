# Typography font-picker verification

Verified on October 30, 2026. The picker now opens with rows in the actual viewport and scrolls without installing every face that passes under the pointer. The measurements establish these behavior changes; they do **not** show a general typing-latency improvement.

## Frozen executables and environment

The baseline is `ee4665dd43091d86f897ecae71eccdbbe52196e6`. The candidate is `5af723fd8ee1c2c7013a30e2d9cb937a6bbbf1e4` plus the retained source overlay, including the font-render presentation bridge. Candidate compilation finished before the subsequent Slug renderer work began. Later renderer changes are outside these measurements. After this frozen build, one presentation-only correction separates the row’s applied-font checkmark from keyboard/hover selection; focused tests cover it, and no additional performance cohort was run for that icon-state change.

Both source trees, production JavaScript, matching source maps, raw JSON, CPU profiles and logs are retained under ignored `artifacts/font-picker-profile/{baseline,candidate}/`. The candidate also retains `source.patch`, its untracked-file list, a separate source worktree and SHA-256 manifests for 1,916 source files and 197 JavaScript/map files. Its new workspace links point at that frozen tree rather than the mutable checkout. A commit ID alone does not identify this overlaid executable.

The foreground native browser was Chrome 156.0.8078.4 on Linux `7.2.8-200.fc44.x86_64`, Intel Core Ultra 5 125H, 1600 × 1000 viewport, DPR 1. The actual WebGPU adapter reported Intel `xe-lpg`, `isFallbackAdapter: false`. Each build and browser command ran alone at low process/I/O priority, with CPU quota 200%, MemoryHigh 2,600 MiB, MemoryMax 3,200 MiB and swap disabled. Browser Node heap was limited to 1,536 MiB. These are workstation measurements, not device-independent performance guarantees.

## Workload and boundaries

The same harness first loads one selected Raleway text layer and waits for the canonical frame and thumbnail work. It records four pointer openings, native typing at 20 ms per character for `Raleway`, `Tinos`, `Pacifico`, and sixteen native wheel attempts near the right gutter. It records first/second-RAF viewport geometry, input echo, exact final result rows, actual font loads/downloads, GPU submissions, read APIs and editor React counters. Full document snapshots stay outside measured input frames.

A separate short CPU diagnostic follows those samples. A second browser case holds the pointer over the middle of the list and delivers eight native wheel packets, then allows one second for real background font/persistence work. It reads actual IndexedDB counts through readonly transactions. These two cases ran serially in the same order for baseline and candidate. They use fresh browser contexts; OS and browser caches are not controlled lab conditions.

The initial baseline experiment incorrectly expected one Raleway result; the catalog also contains **Raleway Dots**. Its failure log is preserved as `invalid-raleway-predicate.log`. The corrected predicate and workload were used for both reported cohorts. No timeouts were raised or first interactions discarded.

## Observed results

| Observation                                                         | Baseline                     | Candidate                           |
| ------------------------------------------------------------------- | ---------------------------- | ----------------------------------- |
| Useful rows intersecting viewport at second RAF                     | 0 on all 4 openings          | 5 on all 4 openings                 |
| Explicit wheel repairs before the list was usable                   | 4                            | 0                                   |
| Cold pointer release → second observed RAF                          | 56.0 ms, blank               | 72.5 ms, rows visible               |
| Three warm second-RAF observations                                  | 58.5 / 37.0 / 36.1 ms, blank | 61.3 / 49.2 / 52.9 ms, rows visible |
| Native key timestamp → input echo RAF, 20 characters, median / p95  | 6.7 / 13.3 ms                | 13.7 / 16.6 ms                      |
| Final correct results RAF, Raleway / Tinos / Pacifico               | 6.9 / 4.9 / 3.0 ms           | 14.4 / 16.0 / 15.1 ms               |
| Middle-list wheel timestamp → observed RAF, 8 packets, median / p95 | 32.4 / 50.4 ms               | 32.7 / 48.2 ms                      |
| Middle-list wheel dispatch → RAF, median / p95                      | 0.4 / 0.7 ms                 | 0.7 / 1.0 ms                        |
| Stored font originals before → after those 8 wheel packets          | 2 → 8                        | 2 → 2                               |
| Stored face metadata before → after those 8 wheel packets           | 6 → 18                       | 6 → 6                               |
| Actual GPU submissions during those 8 wheel packets                 | 6                            | 0                                   |

The baseline virtual window began around row 13 while the real portal viewport remained at scrollTop 0. Restoring the DOM scroll position in the portal ref callback fixes this mismatch. The old first-RAF geometry cannot be described as a useful opening, regardless of its shorter clock.

At the candidate’s cold second RAF, all five visible samples still explicitly showed loading; the first native `FontFace.load()` resolved 84.6 ms after the opening pointer release. Visible rows and decoded samples are separate milestones.

The candidate performs real sample work absent from the old generic `Aa` rows. Nine sample faces decoded across the main workload; the middle-wheel case retained eight, all actually loaded. That case fetched four ephemeral visible samples, versus six durable canvas-font downloads in the baseline. It did not add installed originals or face metadata. This is bounded work, not zero network activity.

Both cohorts retained identical `.musart-app`, `.inspector`, `.canvas-area`, `.editor-canvas` and `.editor-gpu-scene` React counters during unchanged-document input. Actual GPU/WebGL/Canvas2D/video-frame read probes remained zero. The main typing/gutter-wheel interval added zero GPU submissions. No result claims a GPU duration or physical display timestamp.

Only **2 of 16** right-gutter wheel attempts reached the candidate list capture listener, versus 16 in the baseline. The harness retained all observations, but that gutter latency distribution is unsuitable for comparison. The middle-list diagnostic delivered all eight packets in both versions. It supports the persistence/preview result and its own stated timings; it does not repair the missing gutter samples.

The short diagnostic CPU profiles are mapped against their matching production maps. Baseline samples include font-index construction and repeated translation work; candidate samples still include index construction and now include bounded download/FontFace work. Their control flow differs because the baseline needs a repair wheel, so profile totals are attribution evidence, not a speedup benchmark.

## Functional and lifecycle checks

Focused mirrored tests cover the cache limits, aborts, late results, pause/resume, native local naming, existing custom originals, stale renderer callbacks, generation ownership, keyboard behavior, import failures, one-step undo and cancellation. A real Motion case verifies the paused evaluated weight of 800; opening during playback changes neither the document snapshot nor undo history. Typecheck, scoped type-aware lint, React lint, formatting and the zero-violation rules check passed.

The native font test verifies actual Tinos row decoding and the requested family's renderer `ready` acknowledgment. PNG witnesses prove Inter → Tinos → cancelled Inter, Lora preview = committed Lora, and undo → Inter; the commit owns a new request generation. Editor React counters and native read probes remain unchanged during preview. Another native case imports real TTF bytes, saves, reloads and verifies the same custom family and decoded export pixels.

Pixel captures must hide the complete Radix popper wrapper through temporary screenshot CSS: the floating picker overlaps the artboard, so an ordinary element screenshot includes its compositing. The original comparison failure and the intermediate capture attempts are retained under `candidate/failed-functional/`; six clean PNG witnesses are in `candidate/native-frames/`. This changes the observation only, not production rendering or expected pixels.

## Reproduction

Follow [the shared protocol](protocol.md). Build the frozen worktree to its retained `dist` with source maps; serve that directory alone on port 6201. `artifacts/font-picker-profile/playwright.config.ts` disables the usual web-server build and points at that production preview. Run these explicit cases serially with `--workers=1` and the resource scope above:

```sh
MUSART_FONT_SHA=<frozen-source-and-overlay> MUSART_FONT_OUTPUT=artifacts/font-picker-profile/<cohort> \
  bunx playwright test test/browser/font-picker-performance.spec.ts --config artifacts/font-picker-profile/playwright.config.ts --workers=1
MUSART_FONT_SHA=<frozen-source-and-overlay> MUSART_FONT_OUTPUT=artifacts/font-picker-profile/<cohort> \
  bunx playwright test test/browser/font-hover-scroll.spec.ts --config artifacts/font-picker-profile/playwright.config.ts --workers=1
bunx playwright test test/browser/font-picker.spec.ts --config artifacts/font-picker-profile/playwright.config.ts --workers=1
```

This bounded UI investigation does not run the unrelated 50-image effect workload. It does not establish low-end mobile performance, every font/script's glyph coverage, a cold network guarantee, INP or a global speedup. Samples above 4 MiB or without a usable source show an explicit unavailable state; normal font installation retains its existing 32 MiB limit.

## October 31: sample lifecycle, editable morphs and opening work

A native development reproduction confirmed that React effect replay disposed the
memoized sample cache before `resume()`/`acquire()`. Real Inter bytes decoded with
`FontFace.load()`; mounted rows were using a disposed cache. The picker now retains
ownership across replay and pauses pending requests immediately on release, with
final disposal in a microtask if no owner returns. Renderer feedback stays in the
trigger; the verbose ready paragraph was removed.

The same investigation found an exact font-name comparison that treated Inter and
Inter Variable as different sources. Any mismatch discarded authored morph poses
and generated a two-state superellipse inflation. Canonical aliases now retain the
same contour/resource identity. Different fonts, weights and text use their real
shaped glyphs with the authored timing/placement envelope. Generic Inflate uses a
small outline offset that retains stems, concavity and counter placement.

### Frozen production opening cohort

The frozen source is `88e627f` plus the owned font/morph overlay in
`artifacts/font-popover-cohort/`. Baseline and candidate both contain the functional
sample/morph corrections; this comparison isolates opening work. The baseline
retains eager indexing, early input autofocus, the unconditional ref scroll access
and immediate full-catalogue loading. The final candidate skips empty-query
indexing, resolves five category translations once, focuses through Radix after
positioning, avoids zero-position scroll access and defers optional metadata until
the existing presentation boundary is free. Closing cancels that deferred read.

Both production builds, matching maps, the saved baseline picker/search files and
final source/hash manifests are retained under `artifacts/`. The initial diagnostic
build setup failures (workspace aliases/dependency links) did not run a timing
cohort. An intermediate candidate improved warm openings but retained the cold
cost; its measurements are preserved rather than substituted for the final run.

Environment: Chrome 156.0.8078.79, Linux, 1600 × 1000, DPR 1, native Intel xe-lpg
adapter with `isFallbackAdapter: false`. Each build/browser check ran serially at
low priority, CPU quota 100%, swap disabled, browser MemoryHigh 2,200 MiB and
MemoryMax 3,000 MiB. This is a shared workstation, not a controlled performance lab.

The same native test opens the picker four times on one selected Inter Variable
text layer. It records the first viewport containing useful rows and the following
RAF, plus browser Event Timing entries. Before each close it waits for the complete
catalogue and decoded Inter sample, so warm comparisons do not hide deferred
metadata/sample work. Five rows intersect the viewport, search owns focus, document
snapshots/editor React counters remain unchanged and native pixel-readback probes
remain zero. CPU profiling runs separately after those unprofiled samples.

| Observation, cold then three warm openings                        | Baseline                     | Final candidate            |
| ----------------------------------------------------------------- | ---------------------------- | -------------------------- |
| Native pointer timestamp → observed presentation opportunity (ms) | 286.6 / 116.3 / 94.3 / 171.4 | 134.5 / 79.5 / 65.9 / 87.4 |
| Browser Event Timing duration for opening interaction (ms)        | 488 / 120 / 104 / 184        | 200 / 88 / 80 / 96         |

These are four raw observations, not p95, field INP or a universal instant-opening
guarantee. The cold diagnostic trace is separately instrumented and slower: its
mapped stack identifies the ref's `scrollTop` access forcing style/layout during
commit, plus optional Google catalogue preparation. Earlier development and
intermediate-production observations remain in their own JSON/profile files;
they are not mixed into this table.

Reproduce serially against each retained production preview, following the resource
scope in [the shared protocol](protocol.md):

```sh
MUSART_FONT_OUTPUT=../font-popover/baseline-final \
  bunx playwright test test/browser/font-popover-performance.spec.ts --config artifacts/baseline.config.ts --workers=1
MUSART_FONT_OUTPUT=../font-popover/final \
  bunx playwright test test/browser/font-popover-performance.spec.ts test/browser/font-morph-editing.spec.ts --config artifacts/final.config.ts --workers=1
```

Those temporary configurations live in the frozen worktree and point to its
baseline/final preview servers on ports 4187/4189. The native morph case verifies
actual decoded row samples, identical Inter alias pixels, changed readable Tinos
pixels, cancellation, one-step commit/undo and native WebGPU/WebGL exports with
mean RGB difference below one byte and zero production JavaScript pixel readbacks.
