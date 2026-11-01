import { mkdirSync, writeFileSync } from "node:fs";
import { spatialProvenance } from "./spatial-provenance";
import { strategies, type Adapter } from "../../packages/spatial-index/bench/adapters";
import {
  fixture,
  queries,
  linear,
  type Distribution,
} from "../../packages/spatial-index/bench/fixtures";
import type { SpatialBounds, SpatialEntry } from "../../packages/spatial-index/src";

const sizes = (process.env.MUSART_SPATIAL_SIZES ?? "500,1000").split(",").map(Number);
if (sizes.some((size) => ![500, 1000, 10000].includes(size)))
  throw new Error("Use sizes 500,1000,10000; schedule 10k only after smaller results are healthy.");
const samples = Number(process.env.MUSART_SPATIAL_SAMPLES ?? 7);
const repeats = Number(process.env.MUSART_SPATIAL_REPEATS ?? 4);
if (
  !Number.isInteger(samples) ||
  samples < 3 ||
  samples > 31 ||
  !Number.isInteger(repeats) ||
  repeats < 1 ||
  repeats > 64
)
  throw new Error("Invalid bounded sample budget");
const percentile = (values: number[], part: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * part))]!;
const summarize = (values: number[]) => ({
  median: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  raw: values,
});
let checksum = 0;
function timedQuery(
  adapter: Adapter,
  boxes: SpatialBounds[],
  order: Map<string, number>,
  ordered: boolean,
) {
  const start = performance.now();
  for (let repeat = 0; repeat < repeats; repeat++)
    for (const b of boxes) {
      const ids = adapter.search(b);
      if (ordered) ids.sort((a, z) => order.get(a)! - order.get(z)!);
      checksum += ids.length + (ids.length ? Number(ids[0]) : 0);
    }
  return ((performance.now() - start) * 1000) / (boxes.length * repeats);
}
function verify(adapter: Adapter, entries: SpatialEntry[], boxes: SpatialBounds[]) {
  for (const b of boxes) {
    const actual = adapter.search(b).sort();
    const expected = linear(entries, b).sort();
    if (actual.length !== expected.length || actual.some((id, at) => id !== expected[at]))
      throw new Error("Broad-phase oracle mismatch");
  }
}
// Warm shared Flatbush/JSC internals for every strategy before comparing medians;
// otherwise the wrapper (run last) can inherit optimization paid for by its comparator.
const initialPreparation: { strategy: string; milliseconds: number }[] = [];
const warmEntries = fixture(500, "grid"),
  warmOrder = new Map(warmEntries.map((entry, at) => [entry.id, at]));
const warmBoxes = [
  ...queries(warmEntries, "point").slice(0, 8),
  ...queries(warmEntries, "tiny").slice(0, 8),
  { x: -1, y: -1, width: 10000, height: 10000 },
];
for (let round = 0; round < 24; round++)
  for (let at = 0; at < strategies.length; at++) {
    const strategy = strategies[(at + round) % strategies.length]!;
    const start = performance.now();
    const adapter = strategy.build(warmEntries);
    if (!round)
      initialPreparation.push({ strategy: strategy.name, milliseconds: performance.now() - start });
    timedQuery(adapter, warmBoxes, warmOrder, false);
    timedQuery(adapter, warmBoxes, warmOrder, true);
    const changed = adapter.update([{ ...warmEntries[0]!, x: 20000 }], []);
    checksum += changed.search(warmBoxes[0]!).length;
  }
const rows = [];
for (const size of sizes)
  for (const distribution of ["grid", "clustered", "overlap"] as Distribution[]) {
    const entries = fixture(size, distribution);
    const order = new Map(entries.map((e, at) => [e.id, at]));
    for (const strategy of strategies) {
      const builds: number[] = [],
        heap: number[] = [],
        gc: number[] = [];
      let retained: Adapter | null = null;
      for (let sample = 0; sample < samples; sample++) {
        retained = null;
        Bun.gc(true);
        const before = process.memoryUsage().heapUsed,
          start = performance.now();
        retained = strategy.build(entries);
        builds.push(performance.now() - start);
        const gcStart = performance.now();
        Bun.gc(true);
        gc.push(performance.now() - gcStart);
        heap.push(process.memoryUsage().heapUsed - before);
      }
      const adapter = retained!;
      const query = [];
      for (const kind of ["point", "tiny", "marquee"] as const) {
        const boxes = queries(entries, kind);
        verify(adapter, entries, boxes); // Correctness and warmup excluded from samples.
        for (const ordered of [false, true]) {
          timedQuery(adapter, boxes, order, ordered);
          query.push({
            kind,
            ordered,
            microseconds: summarize(
              Array.from({ length: samples }, () => timedQuery(adapter, boxes, order, ordered)),
            ),
            candidateCount: summarize(boxes.map((b) => adapter.search(b).length)),
          });
        }
      }
      const updates = [];
      for (const fraction of [0.002, 0.01, 0.1, 1]) {
        const changes = entries
          .slice(0, Math.max(1, Math.ceil(size * fraction)))
          .map((e) => ({ ...e, x: e.x + 10000 }));
        const removalCount = Math.min(3, size - changes.length);
        const changedIds = new Set(changes.map((e) => e.id));
        const removed = removalCount
          ? entries
              .slice(-removalCount)
              .map((e) => e.id)
              .filter((id) => !changedIds.has(id))
          : [];
        const values: number[] = [];
        let updated: Adapter = adapter;
        for (let sample = 0; sample < samples; sample++) {
          const base = strategy.build(entries);
          const start = performance.now();
          updated = base.update(changes, removed);
          values.push(performance.now() - start);
        }
        const byId = new Map(entries.map((e) => [e.id, e]));
        for (const id of removed) byId.delete(id);
        for (const e of changes) byId.set(e.id, e);
        const next = [...byId.values()];
        const boxes = queries(next, "tiny");
        verify(updated, next, boxes);
        updates.push({
          fraction,
          changed: changes.length,
          removed: removed.length,
          milliseconds: summarize(values),
          postUpdateQueryMicroseconds: timedQuery(updated, boxes, order, true),
          overlaySize: updated.overlaySize,
        });
      }
      rows.push({
        size,
        distribution,
        strategy: strategy.name,
        buildMilliseconds: summarize(builds),
        retainedHeapDeltaBytes: summarize(heap),
        explicitCollectionMilliseconds: summarize(gc),
        packedBytes: adapter.packedBytes,
        query,
        updates,
      });
    }
  }
const report = {
  boundary:
    "Bun CPU broad phase only; inclusive candidates with optional identical document-order sort. No rendering, input or GPU claims.",
  memoryBoundary:
    "heapUsed deltas after explicit full collections are noisy process diagnostics, not precise per-index retained bytes. packedBytes excludes objects/maps/query arrays. Explicit collection time is not an automatic-GC count.",
  environment: spatialProvenance(),
  buildBoundary:
    "Build medians follow common rotated all-strategy prewarm. initialPreparation captures first observed 500-grid construction in shared process order, not isolated per-library cold-start cost.",
  initialPreparation,
  sizes,
  samples,
  repeats,
  checksum,
  rows,
};
const path = process.env.MUSART_SPATIAL_REPORT ?? "artifacts/spatial-index/cpu.json";
mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
writeFileSync(path, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      report: path,
      checksum,
      rows: rows.map((r) => ({
        size: r.size,
        distribution: r.distribution,
        strategy: r.strategy,
        buildMs: r.buildMilliseconds.median,
        pointUs: r.query.find((q) => q.kind === "point" && !q.ordered)?.microseconds.median,
        tinyUs: r.query.find((q) => q.kind === "tiny" && q.ordered)?.microseconds.median,
        packedBytes: r.packedBytes,
      })),
    },
    null,
    2,
  ),
);
