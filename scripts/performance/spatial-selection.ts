import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { spatialProvenance } from "./spatial-provenance";
import { createLayer, createPage } from "../../packages/core/src/document/factories";
import type { Composition, Layer } from "../../packages/core/src/document/model";
import type { Bounds, Point } from "../../packages/core/src/layers/geometry";
import { createLayerGeometryIndex } from "../../packages/core/src/layers/geometry-index";
import { fixture, queries, type Distribution } from "../../packages/spatial-index/bench/fixtures";
interface Geometry {
  hitTest(point: Point): Layer | null;
  worldBounds(id: string): Readonly<Bounds>;
}
interface BaselineModule {
  createLayerGeometryIndex(this: void, page: Composition): Geometry;
}
const baselineRoot = process.env.MUSART_SPATIAL_BASELINE;
if (!baselineRoot)
  throw new Error("MUSART_SPATIAL_BASELINE must identify a frozen pre-change worktree (df9d050).");
const baseline = (await import(
  pathToFileURL(resolve(baselineRoot, "packages/core/src/layers/geometry-index.ts")).href
)) as BaselineModule;
const sizes = (process.env.MUSART_SPATIAL_SIZES ?? "500,1000").split(",").map(Number);
if (sizes.some((size) => ![500, 1000, 10000].includes(size))) throw new Error("Unsupported size");
const freeze = (page: Composition): Composition => {
  for (const layer of page.layers) Object.freeze(layer);
  Object.freeze(page.layers);
  return Object.freeze(page);
};
const factories = [
  { name: "baseline", create: baseline.createLayerGeometryIndex },
  { name: "indexed", create: createLayerGeometryIndex },
];
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const rows = [];
let checksum = 0;
for (const size of sizes)
  for (const distribution of ["grid", "clustered", "overlap"] as Distribution[]) {
    const boxes = fixture(size, distribution);
    const pointQueries = queries(boxes, "point");
    const canonical = freeze(
      createPage({ layers: boxes.map((box) => createLayer("rectangle", box)) }),
    );
    const expected = baseline.createLayerGeometryIndex(canonical);
    for (const { name, create } of factories) {
      // Distinct snapshot objects keep the cold cache boundary genuine for both factories.
      const cold = [],
        warm = [],
        afterEdit = [],
        mutablePose = [];
      for (let sample = 0; sample < 7; sample++) {
        const page = freeze({ ...canonical, layers: [...canonical.layers] });
        const start = performance.now();
        const index = create(page);
        const hit = index.hitTest(pointQueries[0]!);
        cold.push(performance.now() - start);
        if (hit?.id !== expected.hitTest(pointQueries[0]!)?.id)
          throw new Error("Cold narrow-phase oracle mismatch");
        for (const point of pointQueries)
          if (index.hitTest(point)?.id !== expected.hitTest(point)?.id)
            throw new Error("Narrow-phase oracle mismatch");
        const warmStart = performance.now();
        for (let repeat = 0; repeat < 4; repeat++)
          for (const point of pointQueries) checksum += Number(index.hitTest(point)?.id ?? 0);
        warm.push(((performance.now() - warmStart) * 1000) / (4 * pointQueries.length));
        const edited = freeze({
          ...page,
          layers: page.layers.map((layer, at) =>
            at === 0 ? { ...layer, x: layer.x + 5000 } : layer,
          ),
        });
        const editedStart = performance.now();
        const editedIndex = create(edited);
        checksum += Number(editedIndex.hitTest(pointQueries[0]!)?.id ?? 0);
        afterEdit.push(performance.now() - editedStart);
        const pose: Composition = {
          ...page,
          layers: page.layers.map((layer, at) =>
            at % 10 === 0 ? { ...layer, rotation: 35, affine: [1, 0.2, 0.3, 1] } : layer,
          ),
        };
        const poseStart = performance.now();
        checksum += Number(create(pose).hitTest(pointQueries[0]!)?.id ?? 0);
        mutablePose.push(performance.now() - poseStart);
      }
      rows.push({
        size,
        distribution,
        strategy: name,
        coldBuildAndFirstHitMs: { median: median(cold), raw: cold },
        warmHitMicroseconds: { median: median(warm), raw: warm },
        singleEditBuildAndFirstHitMs: { median: median(afterEdit), raw: afterEdit },
        uncachedMotionPoseBuildAndFirstHitMs: { median: median(mutablePose), raw: mutablePose },
      });
    }
  }
const output = process.env.MUSART_SPATIAL_REPORT ?? "artifacts/spatial-index/selection.json";
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      environment: spatialProvenance(),
      commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      baselineRoot,
      baselineCommit: execFileSync("git", ["-C", baselineRoot, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      boundary:
        "Bun CPU selection: cold factory + first hit, warmed hits, first hit after a committed immutable edit, and uncached mutable Motion pose. No physical input or GPU timing.",
      checksum,
      rows,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      report: output,
      checksum,
      rows: rows.map(
        ({
          size,
          distribution,
          strategy,
          coldBuildAndFirstHitMs,
          warmHitMicroseconds,
          singleEditBuildAndFirstHitMs,
          uncachedMotionPoseBuildAndFirstHitMs,
        }) => ({
          size,
          distribution,
          strategy,
          coldMs: coldBuildAndFirstHitMs.median,
          warmUs: warmHitMicroseconds.median,
          editMs: singleEditBuildAndFirstHitMs.median,
          poseMs: uncachedMotionPoseBuildAndFirstHitMs.median,
        }),
      ),
    },
    null,
    2,
  ),
);
