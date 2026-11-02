# Undo/redo presentation cost

Undo/redo restores retained, immutable engine snapshots. The measured delay came
from synchronous React work after publication: unchanged layer controls, closed
effect popovers, artboard controls and numeric fields rebuilt before the canvas
could present the restored revision. The correction reduces that work without
delaying the authoritative engine or panel updates.

The final hardware cohort measured median native-key dispatch to canonical
renderer acknowledgment of 35.0 ms for flat artwork, 104.1 ms for six spatial
meshes and 26.7 ms for effect artwork. These are bounded development-environment
observations, not physical display latency or a universal instant-undo claim.

Read the [history contract](../architecture/history.md) and
[measurement protocol](protocol.md) before repeating this investigation.

## Retained controls

- Layer lock/visibility controls receive visible primitives and layout-committed
  callbacks. Unrelated layer edits retain their Radix controls and focused DOM.
- Artboard headings retain unchanged workspace geometry. Mode footers subscribe
  to primitive project/page identities and mode availability, without retaining
  an obsolete project or its original media. Mode actions inspect the current
  engine when invoked.
- Alignment tools retain selected identities and reference predicates. A queued
  action keeps its click-time identities and the original canonical guard.
- Closed attachment cards receive a weak, committed page port. Opening resolves
  the current page; open drafts and queued actions retain strict ownership.
  Unchanged sibling cards do not rebuild their effect/mask popovers.
- Motion diamonds retain semantic addresses and primitive owner identities while
  their imperative subscriptions update time, key and lock state.
- Engine-bound numeric fields retain their native input leaf. A shared transport
  subscription paints scalar values and cancels stale typing, scrubbing and held
  keys. Layout-committed adapters retain fresh callbacks and reset values.

Numeric retention compares all remaining input behavior, including mixed state,
limits, precision, disabled state, units and snap settings. Scrub-label comparison
is limited to intrinsic presentation elements and explicitly known icons with
equal props. Fresh callbacks, refs and opaque components retain ordinary identity
comparison.

## Preserved ownership and history

| Transition                            | Required behavior                                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical artwork or selection change | Cancel an active numeric draft even when its displayed value is unchanged; a later pointer/key release or blur cannot commit it.                                                                    |
| Compatible ruler-only commit          | Keep the active Inspector draft and controls. The existing immutable ruler-scope proof admits this metadata change.                                                                                 |
| Undo, redo or load                    | Cancel active drafts, including a ruler-only history restoration. Numeric presentations share one lightweight commit-info observer per engine to distinguish history from an ordinary ruler toggle. |
| Rebound field or abandoned render     | Replace committed ownership only at a layout commit; old callbacks cannot adopt an uncommitted owner.                                                                                               |
| Mobile dynamic bounds                 | Render the scalar needed to update slider extents. Both resolved values and same-snapshot unresolved fallback changes update the range. Switching from desktop to mobile reads the current scalar.  |

The engine's transaction, retained description, exact undo/redo values and
prepared-transaction guards remain authoritative. These changes introduce no
document keys, GPU readbacks, storage-format changes or deferred React snapshot
adapter. Removing the last numeric consumer releases its shared transport and
history observations.

## MCP software-rendering diagnostic

The original diagnostic used a frozen development checkout at
`http://127.0.0.1:6207/editor?automation=1`; the user's development server was left
running. Its initial source was based on `e2c8014` plus deliberately selected
editor changes. Later intermediate and final checkouts differ; they must not be
treated as a controlled single-change comparison.

All browser samples use native Ctrl+Z / Ctrl+Shift+Z in a fresh isolated context.
The fixtures are 24 flat rectangles, six spatial meshes, and 24 rectangles with
Contrast effects. Preparation waits for the canonical canvas acknowledgment.
Each measured restoration records the generated/dispatch clocks, synchronous
engine/subscriber time, React work, canonical renderer acknowledgment and a
second RAF. Exact restored scalar values are inspected outside that interval.

The environment is Headless Chrome 140 on Linux, 1905 × 2053, DPR 1, Three's
WebGL fallback through ANGLE/Vulkan SwiftShader. The acknowledgment is a renderer
submission/presentation proxy; it is not a hardware GPU duration or physical
display timestamp. Development overhead, software rendering and small sample
counts limit timing comparisons.

The initial engine restoration without subscribers measured about 0.002 ms per
operation over 512 restorations. Initial native spatial undo/redo took 456/635 ms,
and effect undo/redo took 543/631 ms. A separate traced flat redo reported a
709 ms interaction: 660 ms processing and 49 ms presentation delay. The small
engine cost and large React commit established the publication fanout as the
relevant UI boundary. The traced value is diagnostic evidence, not an untraced
latency baseline.

The earlier numeric-only checkpoint contains main `a0c8b4e` and 107 explicitly
selected editor source/test changes, including numeric retention and the ruler fix. Its
18 native restorations produced the following dispatch-to-canonical-acknowledgment
results, with three undo/redo pairs per fixture:

| Fixture              |   Median |          Range | Median React work inside the measured window |
| -------------------- | -------: | -------------: | -------------------------------------------: |
| 24 flat rectangles   | 377.7 ms | 279.4–663.8 ms |                                     310.9 ms |
| Six spatial meshes   | 505.6 ms | 393.2–981.3 ms |                                     434.6 ms |
| 24 effect rectangles | 392.7 ms | 266.8–681.3 ms |                                     340.3 ms |

The synchronous engine call, including its immediate subscribers, took
1.3–9.5 ms. Every input was trusted native input, every restored scalar matched
its expected value, and the application read probes recorded zero GPU buffer,
WebGL pixel and Canvas2D pixel reads. The navigation clock stayed unchanged;
there was no HMR or viewport resize during the cohort.

Each effect restoration rebuilt its one changed-target popover and retained the
23 unchanged sibling popovers. Focused render-count tests establish numeric,
row, alignment and mode retention while preserving cancellation. The browser's
fiber-duration proxy also includes descendant work, so small nonzero samples
are not proof that a particular function rendered again or that all leaf work
was eliminated.

These diagnostic timings do **not** establish an overall latency improvement over
the earlier intermediate checkout: its medians were 231 ms flat, 356 ms spatial
and 414 ms effects. The source differs, the samples are small and the development
software-rendering environment has substantial variance. Unnecessary UI work is
reduced and its ownership is verified; remaining Inspector and layer-tree work
still produces perceptible delays in this environment. This is not an instant
undo/redo claim.

`artifacts/undo-redo-numeric-final.json` contains that checkpoint's raw samples;
the historical filename does not identify the current final runtime.
`artifacts/undo-redo-numeric-provenance.json` records the base commit, frozen
107-file hashes, manifest hash, lockfile/package hashes and driver/report hashes.
Earlier evidence remains in `undo-redo-native-baseline.json`,
`undo-redo-after-row-diagnostic.json`, `undo-redo-total-after.json` and
`undo-redo-final-all.json` under `artifacts/`.

## Final hardware cohort

The final 115-file frozen runtime includes the later retention of background
gradient stop rows and solid color controls across unrelated layer edits. It was
served at the same isolated port, with no source changes during measurement.
This run used `/opt/google/chrome/chrome` (Headless Chrome 156), actual Intel
`xe-lpg` adapters and the WebGPU backend, at 1600 × 1000 and DPR 1. The browser
process tree was limited to 200% CPU, 1800 MiB memory high / 2600 MiB maximum,
zero swap, nice 15 and ionice class 2 / priority 7.

No React commit hook was installed and engine subscribers were not wrapped.
After explicit preparation, the same three fixtures received three native
undo/redo pairs each:

| Fixture              | Median canonical acknowledgment |         Range |
| -------------------- | ------------------------------: | ------------: |
| 24 flat rectangles   |                         35.0 ms |  17.9–42.9 ms |
| Six spatial meshes   |                        104.1 ms | 47.3–144.8 ms |
| 24 effect rectangles |                         26.7 ms |  22.1–52.9 ms |

All 18 inputs were trusted native events and restored their exact expected
values. All three fixtures used WebGPU. Application page errors, GPU buffer
reads, WebGL pixel reads, Canvas2D pixel reads and VideoFrame copies were zero.
There was no HMR, resize or navigation, and the navigation clock was unchanged.
The browser closed after the run. Preparation and raw samples are recorded
separately in `artifacts/undo-redo-hardware-final/report.json`; frozen source,
driver, lockfile and report hashes are in the adjacent `provenance.json`.

This single final cohort establishes the observed hardware rendering path; it
is not a controlled before/after speedup comparison with the earlier Chrome 140
software-rendering checkpoint. Spatial restoration still takes several frame
intervals in this workload. Canonical acknowledgment and the recorded second
RAF remain presentation proxies, not GPU duration, INP or certified physical
display timestamps.

## Reproduction and regression checks

The ignored `artifacts/undo-redo-hardware.ts` driver reproduces the final hardware
cohort. With the shared browser slot reserved and the frozen server ready:

```sh
systemd-run --user --scope --quiet \
  -p CPUQuota=200% -p MemoryHigh=1800M -p MemoryMax=2600M -p MemorySwapMax=0 \
  nice -n 15 ionice -c 2 -n 7 env \
  UNDO_REPORT_DIR=artifacts/undo-redo-hardware-final \
  'PROFILE_URL=http://127.0.0.1:6207/editor?automation=1' \
  bun artifacts/undo-redo-hardware.ts
```

Choose a fresh output directory for another cohort to preserve prior evidence.

For the earlier software diagnostic, `artifacts/undo-redo-mcp-cohort.js` reproduces three native
undo/redo pairs per fixture through Chrome DevTools MCP. Run it inside
`functions.exec` only while holding the shared browser slot:

```js
const input = await tools.exec_command({
  cmd: "cat artifacts/undo-redo-mcp-cohort.js",
  max_output_tokens: 16000,
});
await eval(input.output);
```

Set a fresh `undoCohortStem` with `store()` before another run to preserve earlier
reports. The default output is `artifacts/undo-redo-numeric-final.json`. The
driver records viewport/backend/adapter, actual application read APIs and
unexpected HMR, navigation or resize. It closes its isolated tab afterward.
These ignored drivers/reports are local evidence and must be regenerated in a
fresh checkout.

Focused behavior tests cover row/alignment retention and focus, fresh mode
activation, attachment ownership and cleanup, numeric cancellation and exact
history, mobile range/fallback behavior, and ruler-preview compatibility. The
coordinator owns the integrated static and native checks; leaf render counters
alone are not a responsiveness result.

## History presentation follow-up (2026-11-02)

Canonical engine publication and the scene subscription stay synchronous. Only the
Inspector and Layers subtrees wait for the matching canonical renderer acknowledgment,
then cross a bounded browser presentation boundary and adopt undo/redo snapshots
through interruptible React transitions. Ordinary property gestures and selection
retain their immediate controls; pending Inspector and layer controls preserve global
Undo/Redo shortcuts.
Sidebar snapshots pair history direction with synchronous commit metadata. Plain
layer-row contents retain their children across unrelated historical page identities,
while their parent rows refresh canonical action guards. Rapid visibility/lock actions
read their live value and acknowledge only their own resulting page.

The new native 200-layer cohort includes ten text and ten SVG layers, a first cold
undo, eight undo inputs and eight redo inputs without waiting between them. It checks
all restored values and records native event timestamps, canonical renderer revision
and the second RAF. Full Playwright DOM snapshots are disabled in timing cohorts;
optional CDP profiles are diagnostic runs. Development diagnostic failures are kept
in `artifacts/editor-responsiveness/development-diagnostics/`; clean production
measurements use `artifacts/editor-responsiveness/dist` and its source manifest.

Certified consecutive history/scalar frames can finish while newer requests queue.
Their actual revision remains attached to the draw: an older frame never releases
latest-revision readiness, background GPU work or stale Inspector controls. Compatible
property preview/commit handoffs preserve that progress without merging commands;
cancelled previews reject presentation immediately. Certified input starts composition
in a microtask instead of paying an additional RAF before the display draw.

The native probes observe the actual canvas draw markers and register two later RAF
opportunities directly. This avoids counting an extra polling frame as application
latency. Both original limits remain unchanged: every dispatch-to-canonical sample
must stay below 100 ms, and every generated-input-to-two-RAF sample below 150 ms.
Exact final values, all applied revisions, undo restoration and readback counters are
checked independently of that timing proxy.

Profiling identified repeated number/placeholder writes, canvas chrome mutations and
hard-shadow control deletion. Numeric updates still cancel invalid drafts before
skipping unchanged native strings. Visited shadow controls remain mounted while
hidden. Canvas writes compare native CSSOM serialization and repair external edits;
selection painters preserve each other's visibility/lock state. An outlined text can
reset to zero width using its existing compiled resource, with an exact fill-only
shader branch; text that never used an outline keeps its lighter shader.

The production follow-up used Chromium 156.0.8078.4 on Linux/Fedora 44, a real
Intel `xe-lpg` WebGPU adapter, 1600 × 1000 at DPR 1, with 200% CPU,
2200 MiB memory high / 2600 MiB maximum, zero swap and low process/I/O priority.
The 200-layer native history run retained all 18 commands: median dispatch to
canonical draw was 15.4 ms, maximum 42.1 ms; maximum generated input to two later
RAF opportunities was 103.5 ms. Application GPU/WebGL/Canvas2D/VideoFrame reads
were zero. These are submission and presentation proxies, not physical display
latency or a guarantee on other hardware.

The separate 50-image effect drag workload measured 40.3 ms at the 95th percentile
from generated input to the second RAF, with unchanged effect-pass/upload counts,
zero root canvas/Inspector React commits and zero GPU readbacks during the gesture.
Exact world-space mask pixels, final values and the single undo entry were checked.
Raw reports are retained in ignored `artifacts/editor-responsiveness/ninth-cohort/`
(history) and `delivery-cohort/browser/` (effect drag), alongside source manifests.
A native pixel comparison also verified that resetting an initially outlined text
to zero produces the same fill pixels as ordinary text without another resource
rebuild or shader compilation.

The resumed scalar cohort stabilizes the layout-committed Motion field editor port
and keys native subscriptions by their semantic target addresses. Unrelated
canonical publications no longer propagate a new context into retained controls;
a suspended render cannot replace the committed capture owner. Gesture cancellation
and the optional start-to-begin fallback remain authoritative.

The same 200-layer production workload retained all 33 canonical commands and 12
preview samples, with exact final values, complete undo restoration and zero
application pixel reads. All original 100/150 ms limits passed:

| Input                    | Maximum dispatch to draw | Maximum generated input to two RAF opportunities |
| ------------------------ | -----------------------: | -----------------------------------------------: |
| Outline preview          |                  13.4 ms |                                          57.4 ms |
| Outline commit/reset     |                  34.0 ms |                                          58.2 ms |
| Hard-shadow toggle/reset |                  14.7 ms |                                          49.4 ms |
| Opacity                  |                  47.0 ms |                                          83.4 ms |
| Visibility               |                  16.1 ms |                                          59.1 ms |

This cohort used the same browser, adapter, viewport and resource limits described
above, with tracing disabled. The untraced report is
`artifacts/editor-responsiveness/resume-cohort/property-report.json`; executable
hashes and the source patch are `source-manifest-resume.json` and
`source-resume.patch` in the parent directory. These remain local observations,
not universal latency guarantees. Earlier failures remain archived separately.
