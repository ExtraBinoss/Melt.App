# Landing hero startup and Firefox profiling — 2026-11-02

## Scope and executable

The reported issue was reproduced in a production build of commit `820e2a2`:
Firefox displayed the creation button before the hero text began writing. Work
used a detached worktree at `artifacts/hero-perf/source`, with dependencies installed
using `bun install --frozen-lockfile`. The development server on port 6100 was not
used or restarted. Baseline and corrected builds were served on **127.0.0.1:4179**.
The isolated Vite port change and generated route tree are not product changes.

Matching production JavaScript and source maps are retained in the worktree's
`artifacts/production`, `artifacts/candidate`, `artifacts/final` and
`artifacts/complete`, `artifacts/verified`, `artifacts/delivery` and
`artifacts/ready` directories. The final executable is **ready**; intermediate
builds must not be mistaken for the delivered mascot readiness fix.

Environment: Linux 7.2.8-200.fc44.x86_64, Node 24.19.0, Bun 1.4.2,
Playwright 1.64.1, Firefox 157.0, Chromium 156.0.8078.4, Lighthouse 13.6.0.
Native probes use 1440×1000, DPR 1, French, dark appearance and normal motion.
Browser checks use 1600×1000 plus a 390 px locale-layout witness. Browsers run
headless; these measurements do not establish the user's physical display FPS.

Heavy commands run serially at low priority. Browser/profiler/Lighthouse scopes
use `CPUQuota=200%`, `MemoryHigh=1600M`, `MemoryMax=2400M`, `MemorySwapMax=0`.
This is a shared workstation with other agents active and substantial existing
swap usage. Startup varies between runs. Values below are individual lab runs,
not field percentiles or a statistically controlled device benchmark.

## Confirmed causes and corrections

- The old hero lazily downloaded a **964.99 KB** font-shaping module (232.99 KB
  gzip), then acquired and parsed the font before preparing the title. Known
  localized UI runs now use generated original glyph curves. The module is absent
  from the corrected startup waterfall. Arbitrary text retains the generic parser.
- The offscreen closing headline eagerly forced geometry and font work. It now
  prepares near the viewport or on pointer intent, with disposal and stale-owner
  cancellation preserved.
- SVG painting repeatedly wrote unchanged point/path attributes and terminal
  glyph states. Retained attribute values and glyph phases skip these writes.
  Stage state uses idempotent attribute toggles instead of repeated assignments.
- The native-heading SVG mask was attached during entrance and idle even though
  it only serves local hover replacement. It is now applied only during active
  hover pulses and removed when the last pulse ends.
- All three visible animation clocks capped elapsed time at 60 ms per frame.
  Slow foreground frames therefore stretched the authored sequence. They now use
  actual nonnegative foreground deltas; hidden/offscreen pauses still reset the
  previous frame timestamp and do not catch up hidden time.
- Faster title preparation exposed a race with the lazy mascot runtime. The
  critical hero runtime now arrives with the landing module. The title awaits
  mascot surface readiness before publishing their shared epoch. This retains the
  full entrance rather than allowing a late mascot to skip ahead. Aborted owners
  release the readiness listeners.

- A retained title could be removed during asynchronous geometry replacement,
  then resumed using wall-clock time that included hidden/preparation time. It now
  remains visible until the replacement is ready and resumes stored foreground
  progress. Incidental scroll no longer immediately completes the entrance.
- Visible carousel videos previously requested their sources and decoded during
  the entrance. A diagnostic playback control improved Firefox median RAF spacing
  from roughly 33 ms to 17 ms. Real media admission now waits for the writing
  completion event while the hero is visible, without a fixed timeout. Leaving
  the hero admits feature videos; returning suspends them until writing settles. Reduced motion continues to request only posters.
- Header navigation uses a stable system font from first paint, avoiding late
  Inter font-swap width changes. A delayed-font native test checks link positions.

The generated graphics cover 36 localized UI segments and deduplicate 56
weight/glyph combinations across ten bounded JSON files. Arabic, Japanese, Korean
and Chinese retain browser-shaped native fallback contours because Clash Display
does not cover those scripts; cached unsupported-run markers avoid parser loading.
No font binary is bundled or offered as an editable document font. Regenerate with
`bun scripts/brand/hero-font.ts` after changing copy or the font. The manifest pins
the shared source URL and SHA-256
`e0ec5644c93b04de82f06a076beabfd0e3688ff89655affecf17c92e2747a45d`.

## Native startup measurements

Times are milliseconds from navigation start. Mutation observers record state
publication and RAF opportunities, not certified physical presentation timestamps.
The same probe takes a screenshot when CTA opacity first exceeds 0.05, then waits
for completed mascot/text states. That screenshot has overhead in both versions.
The complete text metric includes the deliberately authored writing sequence.

| Browser / cache | First writing before → after | Complete title before → after | CTA before → after |
| --------------- | ---------------------------: | ----------------------------: | -----------------: |
| Firefox / cold  |                  3844 → 1184 |                   5434 → 2384 |        2736 → 1955 |
| Firefox / warm  |                   1866 → 932 |                   3088 → 2132 |        2394 → 2016 |
| Chromium / cold |                   1356 → 678 |                   2546 → 1878 |        2054 → 1862 |
| Chromium / warm |                    806 → 513 |                   2014 → 1713 |        1851 → 1780 |

Firefox cold complete-title time fell by approximately **56%** in these paired
runs. The full authored writing sequence remains present. On the corrected build,
mascot readiness precedes the shared epoch in both browsers and both cache states
(Firefox cold: 841 ms ready, 851 ms epoch).

## Diagnostic profiling

The Firefox Gecko profile and instrumented attribute counters run separately from
startup timing because instrumentation changes the workload. The first corrected
profile reduced SVG attribute assignments from **24728 to 3989** (84% fewer), and
boundary probes from 4729 to 3418 by omitting the offscreen footer. These are
operation counts, not CPU-duration savings. Boundary probes took 11 ms on that
corrected diagnostic run. Counts depend on delivered frame count and do not prove
an equivalent percentage CPU saving. The diagnostic profile also records the
mascot's RAF transform samples. Native screenshot capture itself can block Firefox
painting; final pacing probes therefore take no screenshot during the entrance and
do not enable Gecko profiling or SVG-call instrumentation.

Final unprofiled RAF samples (no capture during the entrance):

| Browser / cache | Samples | Median gap (ms) | p95 gap (ms) | Maximum gap (ms) | Gaps over 50 ms |
| --------------- | ------: | --------------: | -----------: | ---------------: | --------------: |
| Firefox / cold  |      70 |            17.1 |         33.2 |             50.5 |               1 |
| Firefox / warm  |      83 |            17.1 |         33.2 |             34.2 |               0 |
| Chromium / cold |      87 |            16.7 |         16.8 |             49.9 |               0 |
| Chromium / warm |      88 |            16.7 |         16.8 |             33.3 |               0 |

Firefox warm has no gap above 50 ms in this sample; cold has one. These timestamps
measure callback opportunities and applied mascot transforms, not GPU duration or
certified physical display FPS. The control script held media playback only for
diagnosis; production uses actual visibility/writing state to admit real playback.

## Lighthouse and Chrome trace

A warmed Chrome DevTools trace identified the carousel poster as LCP, rather than
the late hero heading. Consequently the baseline desktop Lighthouse score of 99
failed to describe the Firefox defect. Trace render-blocking/document-latency
insights estimated zero savings; no speculative optimization was made for them.

| Metric               | Baseline desktop | Corrected desktop | Corrected mobile |
| -------------------- | ---------------: | ----------------: | ---------------: |
| Performance score    |               99 |                99 |               85 |
| Accessibility score  |              100 |               100 |              100 |
| Best practices score |              100 |               100 |              100 |
| SEO score            |              100 |               100 |              100 |
| FCP (ms)             |            335.3 |             324.1 |           1504.4 |
| LCP (ms)             |            918.5 |             949.1 |           3928.5 |
| TBT (ms)             |             60.5 |               6.0 |            177.5 |
| CLS                  |          0.00000 |           0.00227 |          0.00000 |
| Speed Index (ms)     |           1122.9 |             835.2 |           2643.3 |

Desktop LCP and both CLS observations meet the published good-value targets.
Mobile LCP (**3.93 s**) remains above the 2.5 s loading target and is a remaining
limitation. No baseline mobile run was collected for this source snapshot. These
lab values do not establish field Core Web Vitals compliance.
[Web Vitals guidance](https://web.dev/articles/vitals) explains the targets and
why navigation Lighthouse does not measure INP.

Lighthouse runs in Chromium, not Firefox. INP is not established by a navigation
Lighthouse run. Native hover regressions verify interaction behavior without
claiming a field INP score. CLS and LCP below are lab observations only.

## Reproduction and retained evidence

Build from the isolated source directory:

```sh
nice -n 15 env RAYON_NUM_THREADS=2 NODE_OPTIONS=--max-old-space-size=2048 \
  MUSART_BUILD_DIR=./artifacts/ready bunx vite build --sourcemap
MUSART_BUILD_DIR=./artifacts/ready bunx vite preview --host 127.0.0.1 --port 4179 --strictPort
```

From the main repository root, `artifacts/hero-perf/probe.ts` records cold/warm
Firefox and Chromium navigation, resource waterfalls, marks and screenshots. Set
`HERO_PERF_OUTPUT=./ready-startup/`; the default URL is 4179. The corresponding raw
baseline JSON files are directly under `artifacts/hero-perf/`.
`probe-profile-complete.ts` enables `MOZ_PROFILER_STARTUP` and saves its shutdown
profile, writes/calls counters and RAF samples under `profile-complete/`.
All generated traces, HTML/JSON reports, screenshots, logs and builds are ignored
artifacts. A reviewed source patch records the measured changes.

Lighthouse CLI uses the installed Playwright Chromium via `CHROME_PATH`,
`--only-categories=performance,accessibility,best-practices,seo`,
`--chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage"`, JSON/HTML
outputs, and `--preset=desktop` only for desktop. Baseline/final desktop reports
and the final mobile report (`lighthouse-ready-*`) are under `artifacts/hero-perf/lighthouse-*.report.*`.

## Verification

- 43 focused code tests passed across eight landing behavior suites, including
  cached/generic/fallback font paths, aborts, active-surface replacement, foreground
  progress, media admission, masks, cleanup and reduced motion.
- 24 native browser cases passed in Chromium and Firefox, covering contour edge
  alignment, mascot motion, intro/hover/rebuilds, all twelve locale layouts, repeated
  loads with scroll/resize, delayed-font navbar positions and decoded media budgets.
- After refining offscreen media admission, six affected cases passed, including
  leaving a font-blocked intro for a real decoded feature clip, then returning to
  the point-writing entrance. This adds two unique cases; it is not a new full gate.
- Focused TypeScript, type-aware Oxlint and React ESLint passed. Production build
  and prerender passed. Formatting and contribution rules are recorded below.
- An initial broader browser command was stopped because that media file also
  contains unrelated Chromium-only CDP scenarios; the final filter retains native
  rendering/media cases supported by both engines. No source assertion was weakened.

Focused formatting passed for all 35 owned/changelog paths.
`bun run check:rules` reported **zero violations** after integration.

Remaining boundary: the exact display face must still be loaded before native
ranges can position its contours. The existing exact-source preload remains in
place. WebGL would not remove that font/layout dependency or bootstrap delay;
these measurements do not justify replacing the renderer merely to improve
startup. No 3D/document GPU subsystem was changed.
