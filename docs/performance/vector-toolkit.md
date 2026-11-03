# Vector preparation: reuse Three, batch XML work

The vector adapter continues to use Three 0.186.1's `SVGLoader`, `ShapePath.toShapes`, `ShapeGeometry` and stroke builder. `ShapeUtils.triangulateShape` already delegates to Three's maintained Earcut implementation. A separate triangulator or SVG parser would duplicate existing work and introduce compatibility risk. The existing `@musart/path-morph` package remains responsible for packed contour sampling/correspondence and shared trajectories; this change adds no competing pure package.

The candidate optimization addresses a concrete repeated operation: previously each imported part created an SVG string, XML document and loader parser closure. The adapter now constructs a single transient SVG document for ordinary multipart sources and lets the same loader visit its sibling paths. A generated numeric part attribute retains original order and identity when Three omits empty paths. It does not persist that attribute or retain a DOM cache. Parsing yields paths incrementally in batches of at most 256 parts or 256 KiB of authored path characters. A larger individual path stays intact in its own batch; no authored detail is truncated. Finished batches can be released during preparation, avoiding an unbounded DOM for the supported 10,000-part import limit. Sources with no parts skip parsing.

Geometry conversion is deliberately unchanged: fills retain 24 curve divisions, strokes retain 48 curve divisions and 12 cap/join divisions, original matrices are applied to completed buffers, and Three owns fill-rule classification, holes, arcs, curves, cap and join expansion. There is no global cache, curve simplification, alternate shader or pixel readback. The existing bounded GPU resource cache already reuses prepared geometry across paint-only changes and playback. Batching targets source preparation; it cannot accelerate an already-retained source draw.

## Reproduction and boundaries

Run the following serially, with low priority and bounded resources following [the performance protocol](protocol.md):

```sh
bunx vitest run packages/render/test/surface/vector/geometry.test.ts packages/render/test/surface/vector/paths.test.ts packages/render/test/surface/vector/source.test.ts --maxWorkers=1
nice -n 15 ionice -c 2 -n 7 bun scripts/performance/vector-toolkit.ts --samples=12 --visual

# Repeat only the controlled warm comparison, preserving the first cohort:
nice -n 15 ionice -c 2 -n 7 bun scripts/performance/vector-toolkit.ts --paired-only --samples=12
```

The standalone harness uses native Chromium DOM parsing, bundles the frozen pre-batch adapter alongside the candidate, and starts its own temporary local server. It does not start the application or require an existing Vite server. Outputs, executable JavaScript, source maps with source content, source revision/status/diff and raw samples are saved under ignored `artifacts/vector-toolkit/`. Copy that directory before rerunning a cohort. Fresh page realms provide a first preparation observation for each implementation/workload; repeated samples rebuild geometry after three untimed warmups. They are repeated source edits/preparations, not warm GPU cache hits. Implementation order alternates by workload. A separate same-realm warm comparison runs eight common baseline/candidate warmup pairs, then alternates which implementation runs first for every measured pair. Preparation is timed without disposal; disposal and a native task turn occur between operations. Raw paired samples retain natural garbage collection rather than forcing or hiding it. `--paired-only` skips the fresh-realm observations and writes to `artifacts/vector-toolkit-paired/`, preserving the original cohort.

Workloads are deterministic synthetic sources: one icon with a hole, 128 imported icon parts with transforms and mixed fill rules, 32 filled/stroked curved parts, and one complex path with 192 authored cubic segments. They expose the difference between per-part XML overhead and genuine curve/triangulation work. They do not establish a representative distribution of users' imported artwork. No claim of an application speedup follows from these CPU timings.

Untimed diagnostics separately wrap native XML parsing, SVGLoader parsing, shape classification, curve sampling, Three/Earcut triangulation, stroke expansion and final buffer transforms. These timings are inclusive and overlap; do not sum them. Main timings run without wrappers. Exact geometry bytes, vertex counts and byte hashes must match the baseline. Buffer bytes are CPU typed-array storage, not total JavaScript heap allocation or GPU/driver residency. The transient allocation reduction established directly is the XML document count (one per bounded batch rather than one per part); no heap-allocation estimate is invented.

`--visual` renders a mixed multipart witness using real Three WebGPU and WebGL backends. It covers mixed fill rules and holes, IDs across empty paths, curves, arcs through the workload buffer checks, mirrored/sheared transforms, fill-only and stroke-only parts, and all cap/join families. It requires a visible nonempty image and exact baseline/candidate screenshot equality within each backend. Production JavaScript read APIs are instrumented; image inspection uses a separate page outside that accounting interval. Requested WebGPU falling back to WebGL is a failure rather than a passing WebGPU check. Adapter identity, viewport, DPR and first-draw CPU submission are recorded. First-draw submission is recorded after `compileAsync`, which may already perform upload work; it is neither isolated upload time nor GPU duration.

The focused regressions additionally check failure propagation and disposal of already-built geometry after a later stroke-build error. Parsing failures occur before buffer generation for that batch; any geometry from earlier batches is disposed through the same failure path. Existing source tests cover retained cache use, live paint, disposal and renderer-state restoration.

## Measurements

The first serial native cohort on November 1, 2026 used Chromium 156.0.8078.4, Linux x64, a 512 × 512 viewport and DPR 1. WebGPU reported Intel `xe-lpg`; WebGL used ANGLE/Vulkan on Intel Arc MTL. The source snapshot is commit `752b252714281131d7cf3f160e125fe43c74e332` plus the captured dirty tree/bundle/maps. Raw results are in ignored `artifacts/vector-toolkit/report.json`.

| Source                         | Baseline repeated median | Batched repeated median | XML parses, baseline → batch |
| ------------------------------ | -----------------------: | ----------------------: | ---------------------------: |
| One icon with hole             |                  0.25 ms |                 0.40 ms |                        1 → 1 |
| 128 imported icon parts        |                 13.15 ms |                 5.50 ms |                      128 → 1 |
| 32 curved fill/stroke parts    |                 12.15 ms |                11.00 ms |                       32 → 1 |
| One 192-cubic fill/stroke path |                122.70 ms |               223.30 ms |                        1 → 1 |

These initial repeated samples used separate page realms with only three per-implementation warmups. They establish substantial savings for the multipart icon workload, but **do not establish a universal speedup**. The large single-path result reverses in the separate diagnostic sample: baseline stroke expansion takes 279.1 ms versus 138.0 ms for batching, despite identical inputs/output and one stroke-expansion call in each case. That source generates 440,307 vertices and 14,117,478 CPU buffer bytes. Both adapters call sampling three times and Earcut once; diagnostic Earcut costs 2.8/3.9 ms and SVGLoader parsing 2.2/3.6 ms respectively. Stroke expansion and its large temporary allocations dominate. A same-realm, common-warmup paired comparison is required before attributing the separate-realm total difference to the adapter. Cold first-preparation observations also vary in the opposite direction (complex path baseline 387.4 ms, batching 169.1 ms); these single cold observations are not a reliable speed ratio.

Native fidelity passed within each backend: baseline/batched screenshots were byte-identical, with 45,092 painted pixels on WebGPU and 45,077 on WebGL. All four renders recorded zero JavaScript GPU/WebGL/Canvas/video-frame pixel reads. Geometry byte hashes, counts and buffer sizes matched for all four workloads. These are standalone renderer fidelity/preparation witnesses, not measured application input latency or an export benchmark.

The controlled same-realm paired cohort subsequently completed with eight shared warmup pairs and twelve alternating measured pairs, under the same bounded-resource protocol. Raw results and executable/maps are retained in `artifacts/vector-toolkit-paired/`.

| Source                         | Paired baseline median | Paired batch median |
| ------------------------------ | ---------------------: | ------------------: |
| One icon with hole             |                0.60 ms |             0.65 ms |
| 128 imported icon parts        |               15.15 ms |             4.25 ms |
| 32 curved fill/stroke parts    |               23.35 ms |            14.45 ms |
| One 192-cubic fill/stroke path |              202.45 ms |           207.75 ms |

The multipart savings persist after common warmup and interleaving. The single complex path is approximately equivalent in this cohort (2.6% slower median), with wide natural variation: baseline 147.8–328.8 ms and batch 133.8–350.3 ms. It does not reproduce the earlier separate-realm 82% regression as a stable adapter effect. Exact geometry checks still pass. Keep the optimization limited to demonstrated multipart parser savings; do not replace Three/Earcut or simplify genuine curve detail to chase the separate stroke-allocation cost.
