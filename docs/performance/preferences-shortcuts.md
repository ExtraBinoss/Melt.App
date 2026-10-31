# Preferences / Shortcuts presentation

The isolated production cohort uses Playwright Chromium 156.0.8078.4 on Linux,
1600 × 1000 CSS pixels, one worker and a CPUQuota=100% scope (one logical core),
MemoryHigh=1700M, MemoryMax=2400M, MemorySwapMax=0, nice=15. An actual static
editor canvas is ready before Preferences opens. Native pointerdown event timestamps
are retained. The probe samples the next animation-frame opportunities, the first
nonzero reveal opacity (>0.05), and completion of active reveal animations. These
are browser presentation proxies, not physical display latency or INP. The first
sample is cold; later samples return through General after its reveal finishes.
The before and after runs use separate frozen production builds, identical browser,
viewport and scope limits. No tracing runs alongside these timing samples.

Before source: 2de5da0b134016dbd9800138c9c2acfff1cb09fa. The baseline assets are
retained under /tmp/melt-export-preparation-review/artifacts/export-production.
The executable was built from source tree
`858758af2475af68705e1d3abdad3512f2813685`; matching JavaScript/source maps
with embedded original source remain in
`/tmp/melt-preferences-review/artifacts/preferences-production`. The final reviewed
tree is recorded in `artifacts/preferences/frozen.json`. Later changes are confined
to reports, the native test harness and non-emitting `this: void` callback receiver
annotations; identical emitted callback JavaScript was verified with Bun’s transpiler.
Raw reports: artifacts/preferences/before.json and after.json.

A separate uncapped Chrome DevTools 140 diagnostic trace identified a 164ms forced
layout in ScrollShadow.measure -> paint: geometry was read after gutter CSS writes.
That diagnostic trace has instrumentation overhead and is not compared numerically
with the native Chromium 156 cohort. The Shortcuts body was approximately 5264px
high and contained 93 rows / nearly 1900 descendants.

The fix reads all geometry before style/attribute writes and animates the bounded
scroll viewport rather than the full body. A measured variable-height list mounts
only the visible shortcut rows plus four rows of overscan on either side. The
focused/recording row remains mounted while scrolling. Tab/Shift+Tab cross the
window boundary through the full command sequence; filtered results reset their
window, and aria-posinset/aria-setsize retain each command's logical position.
ResizeObserver reads row heights after commit, including recording/error feedback
and narrow layouts; scrolling reuses cached geometry. Observers and listeners are
disposed on unmount. Canvas navigation precedes the editing controls.

The intermediate content-visibility-only attempt reduced the cold sample but
showed unstable warm results (308/308/613ms visible). It was replaced rather than
presented as a final performance gain. Its raw samples are retained as
artifacts/preferences/intermediate.json.

## Native results

| Sample | Before mounted / visible / settled (ms) | After mounted / visible / settled (ms) | Mounted rows before / after |
| ------ | --------------------------------------- | -------------------------------------- | --------------------------- |
| Cold   | 243.4 / 377.7 / 637.6                   | 65.6 / 90.5 / 341.5                    | 93 / 10                     |
| Warm 1 | 93.7 / 188.1 / 377.8                    | 58.2 / 90.3 / 291.8                    | 93 / 10                     |
| Warm 2 | 106.4 / 153.4 / 421.1                   | 65.3 / 138.7 / 394.0                   | 93 / 10                     |

These are three observations, not a percentile distribution or a guarantee on other
machines. The first visible sample improved by approximately 76%. The intentional
220ms tab reveal is included in the settled boundary. The final native scenario
also checks navigation placement, Tab crossing a rendered-window boundary, the
last command, actual shortcut persistence, narrow layout and reduced motion.

After-run device metadata:

```json
{
  "dpr": 1,
  "backend": "webgpu",
  "adapter": {
    "vendor": "intel",
    "architecture": "xe-lpg",
    "device": "",
    "description": ""
  }
}
```

The final separate DevTools diagnostic trace sees 10 mounted rows / 230
Shortcuts descendants, versus 93 / approximately 1900 before. Its observed
interaction is 314ms (before: 705ms), CLS remains zero, and the ForcedReflow
insight flags no problem. Trace-instrumented results are kept separate from the
untraced one-core presentation samples above. The intermediate 45ms forced-layout
trace was not the final implementation.

Validation: focused keybinding/search/scroll units include variable row heights,
recording cancellation, cross-window keyboard focus, query resets and observer
cleanup. Native scenarios also verify image previews and decoded PNGs on WebGPU
and WebGL, decoded video frames/audio, genuine silent-source controls and the
Advanced controls animation armed before native input. The image oracle captures
the clipped preview frame, not the canvas element's larger offscreen box or the
page beneath it. Decoded exports are checked edge-to-edge. A bundled clip with an
audio track is not mislabeled as a silent fixture; the silent fixture is a decoded,
verified audio-free export reopened as a new source.
