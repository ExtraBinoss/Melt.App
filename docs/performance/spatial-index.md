# Spatial selection and hover indexing

## Ownership and exact behavior

`packages/spatial-index` supplies an established Flatbush packed R-tree with immutable, bounded edits. It only returns candidates. `LayerGeometryIndex` retains immutable document lookup, parent-local exact picking, visibility/lock inheritance, source-ink tests, ellipse rejection, group clipping/fallback and paint order. A broad rectangle hit does not grant selection. No pixel readbacks, new selection stores, document keys or history entries are introduced.

| Surface / mode                                                    | Query path and retained authority                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas primary click, additive toggles, locked inspection         | Shared indexed `canvasHit`, followed by the existing exact hierarchy/shape tests; engine selection remains authoritative.                                                                                                                         |
| Motion paused scrub and Play pick                                 | Same canvas hit path against the presented pose; canonical IDs validate the final engine selection.                                                                                                                                               |
| Canvas idle hover, including Motion                               | Coalesced native pointer moves use that same exact point query and borrow the existing engine-scoped hover lease. Gestures, controls, tools, leaving and disposal release it.                                                                     |
| Containing / intersecting marquee, primary / secondary / additive | Ordered rectangle candidates retain the original content-bound predicates, inherited flags and engine selection publication/cancellation rules. Children outside group bounds remain eligible as before.                                          |
| Native 3D                                                         | Projected candidates reject native triangle work; source readiness, nearest triangle, per-object visibility, material visibility and opacity remain authoritative. Near-plane ambiguity and animated imported models bypass projection rejection. |
| Layer panel and timeline DOM/native hover                         | Producers already know a durable layer ID: map lookup plus shared presented geometry, never a needless spatial query. The original hover lease owns target identity and cleanup.                                                                  |
| Timeline key/clip/audio/trim/easing hit regions                   | The existing row/time index and viewport virtualization retain their exact interaction priorities. This is a time/row query, distinct from artboard geometry.                                                                                     |
| Wand / segmentation                                               | Target-image choice uses canvas picking; pixel coverage continues to use the original-image worker, rather than object bounds.                                                                                                                    |
| Layer-panel selection, search and keyboard selection              | Known-ID operations retain direct map/engine access; no spatial query is required.                                                                                                                                                                |
| Snapping                                                          | Existing sorted axis/perpendicular buckets remain specialized and bounded to 24 target candidates. World geometry shares `LayerGeometryIndex`; a rectangle tree must not remove distant axis-aligned guide references.                            |

`frameGeometry` / `sourceGeometry` scope reuse to a presented frame's immutable lifetime. Arbitrary mutable drafts still receive fresh core indexes. This avoids rebuilding all lookup maps on every known-ID hover over an evaluated Motion frame. A new presented page retires the old source entry. Hover uses `.canvas-timeline-hover[data-layer-id]` for all producers; native 3D frames use their projected bounds. Selected sparse IDs use direct lookup plus document-order sorting instead of a full layer scan.

## Incremental bounds

Core frozen revisions reuse a weak, bounded recent-snapshot hint. Comparing layer identities marks changed records and their descendants; moves, affine transforms and reparenting therefore update inherited world bounds. Deleted IDs become tombstones. Camera/viewport/spatial changes rebuild projected bounds conservatively because group bounds also depend on descendants. No async results can restore deleted entries, and old snapshots keep their own valid bounds for undo/cancellation.

The packed base never references previous document/index chains. The edit overlay repacks above 64 changed/deleted IDs. The first point query uses the original exact traversal without preparing a tree, so a one-query evaluated Motion pose does not pay a build it cannot amortize. Reused poses first try eight exact foreground visits, returning immediately on a hit or a complete small-tree miss; only budget exhaustion queries/builds the rectangle tree. Dense overlap therefore retains its original foreground early-out. Native 3D similarly raycasts up to eight relevant resources directly rather than indexing unrelated 2D records. These policies bound speculative work; they are not universal optimal thresholds.

The first 500-record diagnostic cohort exposed a serious all-overlap regression in the initial always-query approach (43.20 µs versus 0.101 µs baseline). That candidate was rejected. It also showed that an uncached one-query Motion pose should retain the original scan. The bounded foreground probe and delayed preparation address those concrete findings; only rerun values may describe the final implementation.

## Reproducible cohort

Use [the performance protocol](./protocol.md): one heavy process, bounded resources, low priority, frozen sources and retained artifacts. The coordinator owns the integrated run. The raw CPU harness defaults to 500 and 1,000 records; explicitly admit 10,000 only after smaller cases are healthy.

```sh
bun scripts/performance/spatial-index.ts
MUSART_SPATIAL_BASELINE=/frozen/df9d050 bun scripts/performance/spatial-selection.ts
MUSART_SPATIAL_BASELINE=/frozen/df9d050 bun scripts/performance/spatial-hover.ts
```

The library comparison checks every candidate set against the same inclusive linear oracle. It records first observed process preparation separately, then common rotated all-strategy prewarm before construction medians and point/tiny/marquee searches, sorted and unsorted results, sparse through full updates, post-update queries, packed bytes and explicit-collection/process-heap diagnostics. RBush can mutate in place; the immutable adapter cannot. The selection harness uses the frozen pre-change implementation as the exact narrow-phase oracle and separates cold factory + first pick, warm picks, a committed edit and a fresh evaluated affine Motion pose. The hover harness executes the actual hover lease validation/subscription + known-ID geometry/matrix path, separating canonical and evaluated frames.

The native browser cohort measures generated input/dispatch to outline publication and subsequent presentation opportunities for canvas, timeline and layer-panel hover as well as selection. React counters alone do not establish responsiveness. Resource/readback probes, real triangle picking, screenshots and native focus/gesture checks remain browser responsibilities. CPU timings do not establish GPU duration or physical display latency.

## CPU measurements

November 1, 2026, Linux x64 / Bun 1.4.2, one low-priority process under
200% CPU, 1,600 MiB memory-high / 2,200 MiB maximum and no swap. The candidate
is frozen at `752b252` plus the recorded implementation diff; the narrow-phase
reference is a detached `df9d050` worktree. Raw reports and source hashes are in
`artifacts/scene-spatial/spatial-{package,selection,hover}-final-*.json`.

| Records / distribution | Baseline repeated exact hit | Indexed repeated exact hit |
| ---------------------- | --------------------------: | -------------------------: |
| 500 / grid             |                   11.040 µs |                   1.861 µs |
| 500 / clustered        |                    4.729 µs |                   2.950 µs |
| 500 / all overlap      |                    0.110 µs |                   0.225 µs |
| 1,000 / grid           |                   39.054 µs |                   1.052 µs |
| 1,000 / clustered      |                    4.514 µs |                   4.609 µs |
| 1,000 / all overlap    |                    0.128 µs |                   0.134 µs |
| 10,000 / grid          |                  338.517 µs |                   3.364 µs |
| 10,000 / clustered     |                   61.987 µs |                  54.107 µs |
| 10,000 / all overlap   |                    0.104 µs |                   0.151 µs |

These medians include the authoritative narrow phase, rather than just tree
search. Each cohort verifies exact hits against the pre-change implementation.
Cold construction remains O(n): the 10,000-grid first-hit median was
10.573 ms baseline / 27.668 ms candidate; clustered was 25.942 / 9.968 ms.
These variable cold observations, natural GC and shared-workstation conditions
forbid universal speed ratios. Fresh evaluated poses deliberately retain the
original one-query scan; no repeated-tree saving is claimed for that boundary.

The broad-phase library comparison confirms that wrapping Flatbush does **not**
make its search universally faster. For 500 grid records, direct Flatbush was
0.352 µs, RBush 0.488 µs and the immutable adapter 0.398 µs; at 1,000 grid
records they were 1.219 / 0.380 / 2.632 µs respectively. The adapter is justified
by persistent snapshot semantics and bounded small edits, not a claim to beat
upstream algorithms. All-overlap searches must return every record and can lose
to the linear oracle. That is why exact foreground picking retains its early-out.

A follow-up found that the factory checked `Object.isFrozen(page.layers)` before
consulting its verified WeakMap hit. The cache now returns already-admitted
indexes first: frozen containers cannot thaw. First admission still checks the
page, array and every layer; mutable and shallow-frozen drafts stay uncached.
A focused regression verifies zero repeated integrity checks after admission.
The original slower hover cohort is preserved separately.

The final hover cohort (`spatial-hover-cached-final.json`) measures the actual
lease validation/publication, geometry/matrix lookup and release, after warmup:

| Records / pose     | Baseline hover | Final cached hover |
| ------------------ | -------------: | -----------------: |
| 500 / canonical    |     159.359 µs |           3.995 µs |
| 500 / evaluated    |     275.302 µs |           2.309 µs |
| 1,000 / canonical  |     302.702 µs |           0.969 µs |
| 1,000 / evaluated  |   1,174.266 µs |           1.147 µs |
| 10,000 / canonical |  10,678.435 µs |           0.718 µs |
| 10,000 / evaluated |  17,782.983 µs |           3.252 µs |

Sub-microsecond medians and JIT variation across sizes do not imply larger scenes
are intrinsically faster. These are CPU operations against one reusable pose;
materializing a new pose and DOM painting/presentation are outside the boundary.
The final admission change does not alter repeated exact-hit traversal or
cold-factory admission used by the previous selection cohort.

The completed 10,000-record library comparison records 20 changed IDs plus three
deletions at the 0.2% update boundary. Grid update medians were 2.488 ms for a
Flatbush rebuild, 0.464 ms for mutable RBush updates and 0.017 ms for the immutable
overlay. Clustered updates were 2.360 / 0.201 / 0.006 ms. Query tradeoffs remain:
clustered point searches were 5.261 / 6.392 / 8.924 µs; all-overlap searches were
225.644 / 422.658 / 405.060 µs, versus the linear oracle's 188.052 µs. Persistent
small edits are the adapter's benefit; search itself is still upstream Flatbush.

## Native verification and remaining UI costs

Frozen production builds were exercised with native input at 36, 500, 1,000 and
10,000 records, in Static, Animations and Keyframes. Primary selection, evaluated
pose picking, exact three-item right-drag marquee, layer/timeline hover and the new
canvas hover passed. Chromium/Chrome 156.0.8078.79 on Linux x64 used actual WebGPU
Intel `xe-lpg`, 1,600 × 1,000 viewport / DPR 1. Actual production GPU/WebGL/Canvas/
video-frame JavaScript read counts were zero, with all four hooks installed.
Raw input/dispatch clocks, outline publication, two RAF opportunities and root
React counters are retained in `artifacts/spatial-index/native-*.json`.

These few functional samples are not a latency distribution or physical-display
measurement. At 10,000 records, final ordinary canvas-click publication ranged
15.8–110.6 ms; evaluated-pose clicks were 80.3 ms in Animations and 27.6 ms in
Keyframes. Thus the isolated geometric search improvement does not establish a
uniform improvement in application selection latency. Remaining engine/UI work,
scheduling, JIT and shared-workstation variation still matter.

A separate diagnostic CPU profile mapped to the retained matching production
bundle found a closed MotionPopover taking 18.9 ms inclusive in a 45.2 ms
Animations input-to-outline window. Closed controls evaluated subject lookups for
hidden JSX. They now do zero snapshot reads and do not create PresetPicker children;
opening resolves the current subject once. Focused tests retain current-target
opening, initial-origin handling, disabled state, Escape focus, apply/undo and
stale-origin rejection. The final native 10,000-record scenario also passes,
but its variable latencies above do not prove a specific end-to-end speed ratio.
Profile overhead is kept out of the ordinary cohort; raw profiles and original
maps remain under `artifacts/scene-spatial/` and the frozen `selection-before-menu-dist`.

The existing paused/playing Motion media-picking and resize scenarios pass after
making their French locale and timeline opening explicit in setup. Two older
canvas-selection assertions fail identically on the reference and candidate at
stationary secondary clicks (target selection / inactive-artboard activation);
no assertion was removed or weakened to hide them. The inline 3D scenario completed gizmo drag/undo assertions in production before
its development-only module import failed. Its separate development run stalled
in text-source preparation before any source-key entry was constructed, so the
full inline/orbit scenario is not counted as passing.

No browser FPS or physical input-latency gain follows from these microbenchmarks.
Preserve cold/update regressions and the rejected first candidate.
