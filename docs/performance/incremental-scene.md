# Incremental source dependencies

The retained compositor already caches the final immutable frame, per-job source
keys, bounded source identities and GPU surfaces. This change addresses source
signature preparation when a new certified page or Motion pose reaches a render
job. It does not replace those caches or the shared Three.js/TSL graph.

## Evidence and boundary

A tiny untimed instrumentation probe on the previous path resolved 128 unchanged
rectangle sources in three separate jobs. Each job called `JSON.stringify` 128
times and produced 43,136 UTF-16 code units, including the second and third jobs.
The source interner reused tokens, but only after reconstructing and serializing
the complete signature. This establishes repeated work, not its frame-time share
or a measured speedup. Ordinary instanced primitives can bypass source keys in
the compositor; the probe alone is not an end-to-end primitive workload.

The reproducible CPU harness is:

```sh
bun scripts/performance/scene-dependencies.ts 256 100 > artifacts/scene-dependencies.json
```

Run it under the bounded, low-priority, single-owner conditions in
[the performance protocol](protocol.md). It records the exact commit and working
tree, runtime, layer count, timing boundary, actual stringify calls/serialized
code units, retained scalar payload, dependency-vector allocations and observed
heap delta. Heap delta includes GC noise and is not an allocator-byte measure.
The payload estimate excludes JavaScript object/container overhead. Preserve the
matching source diff beside the report.

The fixture contains text/effects, isolated groups, a referenced mask and a video
original. Each scenario compares canonical and incremental exact source keys
outside its timed interval, then measures unchanged jobs, transform-only poses,
source/effect edits, child reorder, reparenting, mask-world changes, video-frame
stamps and original revision changes. Cold dependency caches and warm caches are
reported separately. The source-signature interner remains the existing shared
interner in both modes; “cold dependency cache” does not mean application startup,
decoded media, GPU compilation or an empty source interner.

The first coordinator-run 504-layer/100-job cohort is retained in
`artifacts/scene-spatial/scene-500.json`. Its warm canonical/incremental CPU times
were 299/98 ms unchanged, 247/145 ms transform-only and 180/120 ms source edits.
It also exposed regressions: 227/329 ms for group order and 203/425 ms for a
parent change, where structural commands cloned source descriptors and prevented
reuse. Those observations motivated the bounded sampling fallback below; they
are evidence about that first candidate, not measurements of the updated one.
No end-to-end rendering speedup follows from these CPU-only results.

The updated harness additionally materializes 32 real poses through
`compileMotion`/`evaluateMotion`/`applyMotionFrame` and the application's actual
`applyPreview` gesture function. It reports publication certificates, frozen
pages and explicit ownership separately. Engine-backed compiled Motion poses are
deeply frozen and publication-certified by core. External compilation privately
freezes its copy without granting an engine publication certificate. Gesture
pages are unfrozen. Unowned external/gesture cases intentionally retain canonical
behavior; the owned gesture case exercises the adapter contract used by the
live canvas. Materialization remains outside the source-dependency timing.

## Updated CPU cohort

The frozen candidate (`752b252` plus retained source changes) was measured on
November 1, 2026, on Linux x64 with Bun 1.4.2, under a 200% CPU quota,
1,600 MiB memory-high / 2,200 MiB maximum, no swap, and low CPU/I/O priority.
`artifacts/scene-spatial/scene-final-500.json` preserves 100 jobs over 504 layers.
Exact canonical keys matched outside every timed scenario.

| Warm scenario | Canonical, 100 jobs | Incremental, 100 jobs | Stringify calls, canonical → incremental |
| --- | ---: | ---: | ---: |
| Unchanged | 235.20 ms | 108.25 ms | 50,600 → 200 |
| One transform | 240.17 ms | 128.06 ms | 50,600 → 300 |
| Source edit | 207.84 ms | 122.74 ms | 50,600 → 400 |
| Group order | 573.00 ms | 299.50 ms | 50,600 → 25,400 |
| Parent change | 370.84 ms | 184.06 ms | 50,600 → 25,400 |
| Engine-compiled Motion | 212.01 ms | 146.89 ms | 50,600 → 300 |
| Owned gesture, one layer | 214.31 ms | 158.64 ms | 50,600 → 300 |
| Owned gesture, all text layers | 372.82 ms | 400.50 ms | 50,600 → 400 |

These are single instrumented CPU cohorts, not browser frame times or a promise
of universal ratios. Serialization instrumentation and shared-workstation/JIT/GC
variation affect timings. The bulk gesture remains a measured 7.4% regression
in this observation despite far fewer serializations; dependency traversal and
source-field comparison still cost work. External unowned pages deliberately
retain canonical serialization. Structural fallback improved the previously
rejected cases, but still serializes changed group signatures and cloned sources.

## Implementation and invalidation

`GpuCompositor` owns one `SourceKeyCache`. A cache entry contains a weak reference
to its latest certified layer, the exact canonical source token and a flat list
of scalar dependencies. Source fields compare by identity/value against the
previous immutable layer; placement, opacity and editor metadata are excluded
from the layer's own source just as in the canonical signature. Transform-only
clones can therefore retain the source token.

Dependency comparison still walks the current hierarchy. It emits child source
tokens plus their ordered transforms, affine coefficients, visibility, opacity
and blending. Referenced masks also emit target/source world matrices, ancestor
visibility/opacity and their source token. Originals, effect-input assets,
video-frame stamps, spatial capture stamps, color space, density and spatial
settings remain dependencies. Changed dependencies reconstruct the existing
canonical signature; identical dependencies avoid serialization and child
signature arrays. This is conservative reuse, not a hash with collision risk.

Cross-job reuse requires either an engine publication certificate or the explicit
`RenderOptions.immutableFrame` ownership contract, with `owner.page === page`.
The current layer must also match the page geometry index. The live canvas passes
the exact `SceneController.read()` frame through `PlaneResources`, including
density/profile resubmissions. Its gesture transforms, shape resize, spatial
previews, effect patches and vector drafts replace published render data rather
than mutate previous frames. This matches the existing presented-geometry
frame-lifetime contract; it does not freeze or clone the whole scene per gesture.
Arbitrary mutable inputs, shallow-frozen external pages, mismatched owners and
foreign layers use the canonical path. The renderer still
recomputes mutable asset identities; immutable pages do not certify caller-owned
asset collections. Failed dependency traversals do not publish an entry.

Entries use LRU eviction with limits of 32,768 entries and 16 MiB of accounted
scalar/string payload. Layers/documents/original bytes are not strongly retained
by this cache. Collected weak representatives, eviction and equivalent cloned
nested content can cause safe misses. Disposal explicitly clears entries and
weak identity bookkeeping. The existing canonical signature and asset identity
interners retain their independent budgets. `GpuCompositor.stats().sourceDependencies`
reports entries, payload, hits/misses and created dependency vectors.

Before comparing a new page, the cache samples at most eight existing source
representatives. Four or more known representatives with no matching source
descriptor select the canonical job path directly. This avoids constructing
dependency vectors when a structural deep clone gives no likely reuse. An exact
repeated page is admitted to warm up a newly stable scene. The cache retains at
most 16 weak recent-page references by density for this decision and reports
`bypassedJobs`. Sampling only selects a slower canonical path; it cannot grant a
source hit or weaken dependency comparison. Structural miss regressions remain
explicit benchmark cases rather than being omitted.

At scale 1 the compositor shares its normal/reference source resolver within a
job. Other densities retain independent resolver state because treated surfaces
still use the fixed authored reference density.

## Validation and remaining scope

Focused regressions live in
`packages/render/test/cache/source-key-cache.test.ts`, alongside the existing
`keys.test.ts` and `spatial-signatures.test.ts`. They cover retained sources,
transform-only clones, source/effect edits, siblings, undo/redo, ordered group
children, parents, affine transforms, mask lineage/world mapping, original
replacement, media/spatial stamps, uncertified inputs, failure and budgets.

This CPU harness does not establish rendered pixels, GPU timings, native input
latency or end-to-end playback speed. Use the existing native composition,
Motion, video and 50-image witnesses when scheduling rendering verification;
retain actual backend information, decoded outputs and production readback
probes. Source preparation, root-frame JSON, global spatial signatures and
effect-pipeline preparation remain separate costs. The implementation avoids a
second scene graph and does not claim that the complete frame pipeline is now
incremental.

## Native verification, November 1

The frozen production build passed the 50-image / 100-effect source-dependency
witness in `test/browser/source-dependencies.spec.ts`: all tile regions contain
painted image pixels, editing an effect changes the first tile, and undo restores
the exact original PNG screenshot bytes. GPU cache accounting remains bounded;
all instrumented production GPU/WebGL/Canvas/video-frame JavaScript reads are zero.
The native 3D render/export witness also passed through WebGPU and WebGL.

A bounded standalone export comparison returned identical 50-image PNG data URLs
(SHA-256 `fbd2929dbfe0063d7d78334d09cd0ce4d262d6328af805ac7b4a8bd13b0c03ce`):
reference wall time 6,169 ms, candidate 6,608 ms. These are single cold observations,
not an export speedup claim. Reports are in `artifacts/scene-spatial/export-return-*.json`.

The older complete density-cycle / encoding / persistence-recovery load scenario
timed out after five minutes in its first standalone PNG request. Smaller bounded
export diagnostics varied, including a pending deadline followed by successful
completion during evidence collection. The paired cold export above passes, but
the complete long scenario's recovery stages remain unverified in this pass.
Do not describe that full workload as passing or attribute its timeout to source
keys without a reproducible stage diagnosis. The full-root compiler experiment
was also stopped under repeated memory pressure; explicit changed-source and
transitive type checks plus pure-core/package checks are the local static boundary.
