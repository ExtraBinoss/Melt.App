# Studio guide entrance performance

Measured on 2026-11-06 against frozen production bundles. The workload is the real
Studio Starter project, including its extruded text, lighting and shadows.

## Change

The capture frame previously combined its animated 4 px blur with a `100vmax`
dimming shadow. Chrome reported a content layer of 4320 × 3690 while profiling a
1440 × 1000 viewport. The dimming surface now uses four non-overlapping,
viewport-bounded rectangles outside the blurred frame. Their opacity entrance is
composited independently; the format-card cascade and frame blur retain their
existing timings. Camera/view updates project the aperture imperatively, including
when part of the capture frame is outside the viewport.

## Controlled interaction cohorts

- Source: `7b2bf50f6614de5b4bfdbcdb31a45ed24bf09eea`, with only the capture
  viewport and framing stylesheet changed for the candidate. Other in-progress
  workspace changes were excluded. Workspace module resolution was explicitly
  pinned to this frozen checkout; the installed dependency lock matched it.
- Production Vite client/server builds and matching source maps; no HMR, development
  server, Playwright tracing or screenshots in the latency cohorts.
- Chromium 156 / Linux, real Intel Arc MTL (`xe-lpg`) adapter, Mesa 26.2.5 / Vulkan,
  `isFallbackAdapter: false`; 1440 × 1000 CSS pixels, DPR 1 and DPR 2.
- One foreground browser cohort at a time. CPU quota 200%, memory high 3500 MB,
  maximum 4200 MB, swap disabled for the browser scope; low process priority.
  Node 24.19.0, Bun 1.4.2.
- Six warm native toggle-on interactions per variant and DPR, after one separately
  retained cold opening and warmup. The final before/after cohorts each contain
  24 measured toggles: full animation and animation disabled at both DPRs.
- An 800 ms observation window per input; native event timestamps, main-thread RAF
  opportunities, long tasks, real root commit counters and document revisions.
  No full-document snapshot is taken in measured RAF callbacks.

“Feedback” below is dispatch to the second RAF opportunity after visible controls
are observed. It is a presentation proxy, not physical display latency, field INP
or a GPU timer. Six observations do not establish a reliable tail percentile;
maximum values are therefore reported explicitly.

| DPR | Variant | Before median feedback | After median feedback | After maximum feedback | After RAF gap p95 / max |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | Full animation | 27.0 ms | 25.6 ms | 26.6 ms | 16.7 / 16.8 ms |
| 1 | Animation disabled | 26.1 ms | 25.8 ms | 27.8 ms | 16.8 / 16.8 ms |
| 2 | Full animation | 27.7 ms | 26.3 ms | 63.7 ms | 16.7 / 50.0 ms |
| 2 | Animation disabled | 26.0 ms | 26.6 ms | 47.5 ms | 16.8 / 33.4 ms |

There were no observed tasks of 50 ms or longer in these warm cohorts. App,
CanvasArea, EditorCanvas and EditorScene commit deltas were zero in every measured
interaction; enabling guides committed exactly one document revision. One of the
286 candidate DPR-2 full-animation RAF intervals reached 50 ms. It remains in the
report: these results do not support a claim of zero jank or a proven improvement
in worst-case input latency.

The approximately 514 ms maximum cascade duration is intentional visual timing,
not a delay before input is accepted. Cards remain native, focusable controls.

## Separate compositor diagnostics

The following figures come from one additional, traced 800 ms full-animation
interaction before and after, at DPR 2 with the same real hardware adapter. Layer
maxima cover the complete diagnostic captures, which also include the isolated
no-canvas-blur and no-card-blur cases. These diagnostics are not mixed with
untraced latency samples.

| Trace category | Before | After |
| --- | ---: | ---: |
| Raster worker task durations, summed | 18.62 ms | 8.01 ms |
| Paint durations, summed | 37.86 ms | 15.98 ms |
| UpdateLayoutTree durations, summed | 50.84 ms | 17.85 ms |
| Layout durations, summed | 7.41 ms | 2.67 ms |
| Largest observed content layer | 4320 × 3690 | 1920 × 1334 |
| Chrome DroppedFrame markers in the diagnostic interval | 4 | 1 |

The largest reported layer area fell by approximately 84%. Layer bounds are not
allocated GPU-memory measurements. Raster worker durations are CPU task durations,
not GPU execution times; do not add nested trace categories into a synthetic total
or treat this single trace as a frame-rate distribution.

The blur remains a CSS filter animation. Chrome still reports its pixel-moving
filter compositing restriction; the optimization reduces its affected surface,
not that browser restriction. This is not a “100% GPU” claim. See Chromium's
[compositor failure reasons](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/animation/compositor_animations.h)
and Chrome's [frame interpretation](https://developer.chrome.com/docs/devtools/performance/reference/).

## Reproduction and evidence

Ignored `artifacts/guide-performance/` retains the source manifest, resolution
patch, candidate application patch, native probe scripts, corrected cohort JSON,
summary JSON, compressed traces/layer snapshots and frozen executable archive.
The archive contains production JS and matching source maps. The source checkout
used for the run lives under `/tmp/melt-guides-profile-7b2bf50`.

Run the retained `guide-profile.ts` with `GUIDE_PROFILE_URL` pointing to the desired
production preview, `GUIDE_PROFILE_VARIANTS=full,none` and
`GUIDE_PROFILE_SAMPLES=6`. Use the same systemd limits above. The native trace probe
uses `GUIDE_TRACE_STEM` to keep each capture separate.

The disabled-animation control suppresses only the newly mounted guide settings
and capture frame. Earlier exploratory comparisons also disabled the popover's
own animation, which restarted it when switching variants; those cohorts were
rejected and are not used in the tables. Clip-mask and edge-only prototypes were
also excluded from the delivered implementation and final measurements.

Functional checks cover the cascade, reduced motion, body/focus behavior,
viewport-bounded non-overlapping dimming bands, format changes, canvas movement,
undo/redo and unchanged exported artwork.
