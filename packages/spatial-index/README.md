# @musart/spatial-index

Pure TypeScript conservative rectangle queries backed by [Flatbush 4.7.0](https://github.com/mourner/flatbush), an established packed Hilbert R-tree. No DOM, React, storage, workers or GPU dependencies.

```ts
import { BoundsIndex } from "@musart/spatial-index";

const original = new BoundsIndex([{ id: "shape", x: 10, y: 20, width: 30, height: 40 }]);
const ids = original.search({ x: 15, y: 25, width: 0, height: 0 });
const moved = original.fork([{ id: "shape", x: 100, y: 20, width: 30, height: 40 }]);
const removed = moved.fork([], ["shape"]);
```

The constructor copies only the five documented fields. Searches include touching boundaries and return unordered candidate IDs. Exact shape tests, hierarchy, ordering, visibility, locks and selection ownership belong to consumers. Invalid/unbounded entries conservatively survive every query; invalid queries return all records. This package rejects duplicate IDs on construction.

Forks share a packed base with a copied, bounded edit map. Changed IDs suppress their old packed entry; deletion tombstones prevent resurrection. More than 64 changed/deleted IDs repacks the current records. Snapshots never reference a chain of preceding snapshots, and old snapshots remain valid for undo or cancelled drafts. The 64-record limit bounds linear overlay search; it is a policy to measure, not a universal optimum. Dense animations can favor rebuilding or a dynamic tree.

`packedBytes` reports the exact Flatbush buffer size, excluding JS entry objects, ID maps, overlay maps and transient query arrays. `overlaySize` exposes the bounded edit count. Results allocate an ID array; callers can sort it only when their contract requires ordering.

## Benchmarks and limits

From the repository root, after installation:

```sh
bun scripts/performance/spatial-index.ts
MUSART_SPATIAL_BASELINE=/path/to/frozen/baseline bun scripts/performance/spatial-selection.ts
MUSART_SPATIAL_BASELINE=/path/to/frozen/baseline bun scripts/performance/spatial-hover.ts
```

The default workload sizes are 500 and 1,000. Schedule 10,000 only after those are healthy, with `MUSART_SPATIAL_SIZES=10000`. Follow the repository's [serial resource protocol](../../docs/performance/protocol.md). Reports go to ignored `artifacts/spatial-index/`; use `MUSART_SPATIAL_REPORT` to preserve named cohorts.

The broad-phase harness compares the same inclusive IDs against a linear oracle, native Flatbush and [RBush 4.0.1](https://github.com/mourner/rbush). An explicit rotated all-strategy prewarm avoids crediting a later wrapper with shared-library JIT work paid by an earlier comparator; first observed process preparation is recorded separately from warmed construction medians. Grid, clustered and all-overlap distributions include points, 0.01-unit tiny rectangles, marquee rectangles, identical optional document-order sorting, builds, 0.2%/1%/10%/100% updates and post-update queries. RBush uses its normal mutable remove/insert API; Flatbush rebuilds; the proposed adapter forks immutable snapshots. Their mutation guarantees therefore differ explicitly. Forced-GC wall time and noisy post-GC process heap deltas are diagnostics, not automatic-GC counts or exact retained-object measurements.

Coordinated 500, 1,000 and 10,000-record cohorts were run on November 1, 2026 (Linux x64, Bun 1.4.2, bounded low-priority process). At 10,000 grid records, updating 20 IDs plus three deletions took 2.488 ms with a Flatbush rebuild, 0.464 ms with mutable RBush and 0.017 ms with the immutable overlay. At 10,000 clustered records, point searches took 5.261 / 6.392 / 8.924 µs respectively: the wrapper does not universally improve query time. Exact candidate oracles passed. Raw reports retain builds, sorted/unsorted queries, dense overlap, all update fractions and memory diagnostics. Complete measurements and production-selection/hover boundaries are recorded in [the integration report](../../docs/performance/spatial-index.md) with the source/environment provenance. A packed tree cannot avoid returning every record in an all-overlap query; integration preserves a bounded exact foreground probe and delays preparation for one-off poses so topmost picking retains its early-out traversal. This is not a claim that a custom wrapper beats established libraries everywhere.

## Verification and license

Focused regressions cover inclusive boundaries, empty/invalid input, immutable updates/deletions, durable-ID reuse, repacking and randomized linear-oracle agreement. Core/web tests retain exact picking and ephemeral hover/selection semantics.

```sh
bunx vitest run packages/spatial-index/test/bounds-index.test.ts --maxWorkers=1
bunx tsc --noEmit -p packages/spatial-index/tsconfig.json
```

MIT licensed; see [LICENSE](./LICENSE). Flatbush and RBush retain their upstream MIT notices in their installed distributions. RBush is benchmark-only.
