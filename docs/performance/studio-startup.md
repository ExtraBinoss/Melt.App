# Studio startup diagnostic

## Scope and environment

The November 1, 2026 investigation covers the development server on port 6100,
Chrome 156.0.8078.79 on Linux, a 1600 × 1000 viewport, native desktop Chrome and
one foreground page. Checks ran at low priority, capped at two logical CPUs,
with a 1600 MiB soft memory threshold, 2400 MiB hard ceiling and no swap.
These are single diagnostic captures, not production benchmarks or physical GPU
execution measurements. Soft-memory pressure affected the editor captures; do
not treat their wall times as normal, uncapped application latency.

The complete editor trace was stopped when memory pressure appeared. A lighter
CPU profile then completed both template creation and reopening the saved project.
The successful CPU profiles, browser metric snapshots and report are retained in
`artifacts/video-stress/project-cpu-profile/`. The library trace and reviewed source
patch are in `artifacts/video-stress/startup-profile-current/`.

## Observations

| Scenario                   | Operation to visible templates/canonical canvas | Mascot JavaScript, inclusive sampled time | Other observed work                                                                    |
| -------------------------- | ----------------------------------------------: | ----------------------------------------: | -------------------------------------------------------------------------------------- |
| Try Melt → templates       |                                        5,613 ms |                                     93 ms | 778 script/style requests, about 195 ms style recalculation and 48 ms layout           |
| Create Bloom Windows       |                                       23,845 ms |                                    302 ms | About 4,443 ms sampled inside native canvas sizing methods; 507 ms style recalculation |
| Reopen saved Bloom Windows |                                       12,396 ms |                                    253 ms | 546 ms style recalculation; React development JSX helpers remain prominent             |

Mascot times include samples in descendants of the brand/throbber functions,
including their native DOM calls. They account for roughly 1–2% of elapsed time
in these captures. SVG painting is part of shared browser paint work and is not
separately attributed to that mascot by the CPU profile. Simplifying its 64-point
contours cannot be presented as a fix for the whole opening delay.

The expensive sizing samples originate from R3F `setDpr` through
`DrawingDensity.apply`, the exact-texel repair in `DrawingDensity.prepare`, and the
standalone presentation surface. Samples establish time spent in these calls,
including native/driver or memory-reclaim waits; they do not establish redundant
call counts or shader execution time. Instrument actual dimension changes before
changing this ownership contract. Do not remove the fractional/non-square texel
repair merely to make the profile smaller.

A separate DevTools trace before the preferences split observed a 1,353 ms style
recalculation affecting 1,042 elements and a 166 ms focus-related reflow. That
capture uses a different browser/session setup and is not a before/after benchmark.

## Bounded changes

- Studio entry controls now retain a native dashboard href before hydration, while
  preserving primary client navigation, keyboard activation and modified clicks.
  An early native click on the old server-rendered button could leave the landing
  page unchanged; that failed interaction is not counted as a 30-second load time.
- Unopened preferences, shortcut settings and their CSS are lazy. The library
  capture requests only the small preferences host and persistence metadata, not
  the actual preference panels or shortcut bindings. Exit animations retain their
  mounted dialog lifetime after the first opening.
- The centered loader is larger. Its original gradient, eyes and animated morph
  remain intact. The proposed transform-only replacement was discarded after
  measuring the mascot's small share of the opening cost.

Prioritize the cold module graph, first editor render and native sizing/queue
boundaries. Any further performance claim needs a frozen production cohort,
separate cold/warm samples and a quiet GPU slot under the shared protocol.

## Resumed opening investigation

The resumed work measures the actual library item dialog's **Open in Melt**
action. A development capture installed Bloom Windows in about 627 ms but waited
a further 17,651 ms for its first visible canvas. The complete driver operation
was 21,146 ms. Subsequent development captures experienced full reloads and are
not comparable performance cohorts. A frozen production build showed a much
shorter 3,026 ms operation, with seven observed tasks of at least 50 ms totaling
820 ms; the longest was 281 ms. These are individual diagnostic captures under
the stated CPU limits, not a production latency guarantee or an INP/TBT score.

The production and development numbers must not be presented as an optimization
speedup. They use different executable modes. A prefetch-only intermediate
production capture also took 9,796 ms, mostly awaiting work rather than sampling
JavaScript. The broad variance means that chunk prefetch alone has not established
a reliable wall-time improvement.

### Verified changes

- The item dialog disables its template/saved-project preview immediately on
  dismissal or a busy open. Its Radix exit animation no longer retains active
  decoding/rendering until unmount.
- The shared editor code preparation promise imports the canvas, toolbar, sidebar
  and Motion dock together. Open in Melt pointer/focus intent starts this code-only
  work; it does not create a renderer or publish a document.
- Video proxy admission also checks the actual current canvas presentation. A
  quiet pointer is insufficient while a new canonical frame is still pending.
  Presentation wakes the existing bounded proxy queue after its normal quiet
  period; original decoding remains available for the first frame.
- Cold font module evaluation, parsing and shaping have real task boundaries,
  shared with morph preparation, so a long promise chain does not monopolize one
  browser task. Cancellation disposes the prepared shaping/outline owners.
- Development opening reports contain bounded observed main-thread task totals
  where the Long Tasks API is supported. They disconnect on finish; production
  creates no observer or timing work. These totals are not isolated GPU timings.

An independent native-video reproduction is published at
[VideoBlackFlash](https://github.com/ExtraBinoss/VideoBlackFlash). Its short native
Chrome 156 / Intel xe-lpg run did **not** reproduce the flash with the simpler
Three/TSL graph. That does not prove that the more complex Melt graph is correct,
and the conservative application fallback remains in place.

### Final focused verification

The final quiet native Chrome 156 capture (headless, Intel Arc through ANGLE/Vulkan,
1600 × 1000, DPR 1, CPU capped at 200%) measured **3,120 ms from Open in Melt
to the first canonical canvas**, and 3,463 ms until the Properties region was
available. Its observed long tasks totaled 1,195 ms, with a 156 ms maximum; zero
production pixel-read APIs were called. This is a single diagnostic sample, and
the earlier 3,026 ms capture used headed OpenGL. It does **not** establish a
controlled wall-time speedup. A later headed run timed out while preparation
remained pending and is excluded, rather than reporting its timeout as latency.

Four focused native browser checks passed: library progress/shared playback,
performance metadata/copy/layout, native pre-hydration studio navigation, and
Open in Melt with proxy worker creation strictly after canonical presentation.
The zoom/DPR test passed ten same-density PNG comparisons with exact pixel
equality and zero production reads. The 50-image/100-effect workload passed
bounded composition updates, idle, export, recovery and readback assertions; its
active adapter reported Intel xe-lpg and `isFallbackAdapter: false`.

Earlier image-comparison runs were stopped at memory pressure. Validation now
clears its temporary decoded-image canvas backing and recreates its inspection
page between comparisons. The successful larger checks also disable Playwright
trace retention and bound both Node (512 MiB heap) and Chrome (768 MiB heap),
with one worker, CPU 200%, MemoryHigh 2400 MiB/MemoryMax 3000 MiB and no swap.
Those checks validate behavior, not normal uncapped application latency.

Final captures/logs are under `artifacts/video-stress/`: `quiet-native.log`,
`density-bounded.log`, `load-native.log`, and `library-open-prod-final-quiet/`.
`artifacts/preview-density/final/diagnostic.json` and
`artifacts/performance-50.json` retain the detailed assertions and environment.
