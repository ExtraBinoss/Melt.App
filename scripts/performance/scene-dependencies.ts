/** CPU dependency preparation only; native pixels/input latency require the browser cohort.
 * bun scripts/performance/scene-dependencies.ts [layers=256] [iterations=100]
 */
import { execFileSync } from "node:child_process";
import { createEffect, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import type { Composition, Layer, Asset } from "@musart/core";
import { createSourceKeys } from "../../packages/render/src/cache/keys";
import { SourceKeyCache } from "../../packages/render/src/cache/source-key-cache";
import { poseOwnership, runtimePoseCases } from "./scene-runtime-poses";
import type { SceneDependencyCase } from "./scene-runtime-poses";

const layerCount = Number(process.argv[2] ?? 256);
const iterations = Number(process.argv[3] ?? 100);
if (
  ![layerCount, iterations].every(
    (value) => Number.isSafeInteger(value) && value >= 2 && value <= 10000,
  )
)
  throw new RangeError("Expected layer/iteration counts from 2 to 10000.");
const assets: Record<string, Asset> = {
  video: {
    id: "video",
    kind: "video",
    name: "Video",
    mime: "video/mp4",
    width: 32,
    height: 16,
    originalId: "video-original",
    contentRevision: "revision-1",
    byteLength: 9,
    duration: { value: 5, rate: 1 },
    firstTimestamp: { value: 0, rate: 1 },
    timeResolution: 30000,
    orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
  },
};
const layers: Layer[] = [
  createLayer("group", { id: "group" }),
  createLayer("group", { id: "other-group" }),
  createLayer("text", { id: "mask", maskSource: true }),
  createLayer("video", { id: "media", assetId: "video" }),
  ...Array.from({ length: layerCount }, (_, index) =>
    createLayer("text", {
      id: `text-${index}`,
      parentId: "group",
      x: (index % 16) * 8,
      y: Math.floor(index / 16) * 8,
      text: `Text source ${index}`,
      effects: [createEffect("blur")],
      mask: index === 0 ? { layerId: "mask", enabled: true, inverted: false } : null,
    }),
  ),
];
function publish(layers: Layer[]) {
  return new EditorEngine(createProject({ assets, pages: [createPage({ id: "scene", layers })] }));
}
const engine = publish(layers);
const page = () => engine.getSnapshot().project.pages[0]!;
const base = page();
function edited(id: string, patch: Partial<Layer>) {
  engine.execute({ type: "updateLayers", ids: [id], patch });
  const changed = page();
  engine.undo();
  return changed;
}
function reparented() {
  engine.execute({ type: "reorderLayer", id: "text-1", index: 0, parentId: "other-group" });
  const changed = page();
  engine.undo();
  return changed;
}
const cases: SceneDependencyCase[] = [
  { name: "unchanged", pages: [base] },
  { name: "transform-only", pages: [base, edited("text-1", { x: 44, rotation: 17 })] },
  { name: "source-edit", pages: [base, edited("text-1", { text: "Replacement" })] },
  {
    name: "effect-edit",
    pages: [base, edited("text-1", { effects: [createEffect("blur", { amount: 0.2 })] })],
  },
  {
    name: "group-order",
    pages: [
      base,
      publish([...base.layers.slice(0, 4), ...base.layers.slice(4).reverse()]).getSnapshot().project
        .pages[0]!,
    ],
  },
  { name: "parent-change", pages: [base, reparented()] },
  { name: "mask-world-change", pages: [base, edited("mask", { x: 17, opacity: 0.5 })] },
  { name: "media-frame", pages: [base], stamp: true },
  { name: "media-original", pages: [base], originals: true },
  ...runtimePoseCases(base, assets),
];
let checksum = 0;
function evaluate(
  page: Composition,
  cache: SourceKeyCache | undefined,
  index: number,
  stamp = false,
  originals = false,
  owned = false,
) {
  const resolve = createSourceKeys(
    page,
    originals && index % 2
      ? {
          video: { ...assets.video!, contentRevision: "revision-2" } as Asset,
        }
      : assets,
    1,
    {
      cache,
      immutableFrame: owned ? { page } : undefined,
      videoStamp: () => (stamp ? `pts:${index % 2}` : "pts:0"),
    },
  );
  const result = page.layers.map(resolve);
  checksum += result.reduce((sum, key) => sum + key.length, 0);
  return result;
}
// Exact canonical key comparison is kept outside every timed interval.
for (const test of cases) {
  const cache = new SourceKeyCache();
  for (let index = 0; index < Math.max(4, test.pages.length); index++) {
    const page = test.pages[index % test.pages.length]!;
    const incremental = evaluate(page, cache, index, test.stamp, test.originals, test.owned);
    const reference = evaluate(page, undefined, index, test.stamp, test.originals);
    if (incremental.some((key, at) => key !== reference[at]))
      throw Error(`Key mismatch: ${test.name}`);
  }
}
function measure(test: (typeof cases)[number], incremental: boolean, cold: boolean) {
  let cache = incremental ? new SourceKeyCache() : undefined;
  if (!cold)
    for (let index = 0; index < 8; index++)
      evaluate(
        test.pages[index % test.pages.length]!,
        cache,
        index,
        test.stamp,
        test.originals,
        test.owned,
      );
  const beforeStats = cache?.stats();
  const heapBefore = process.memoryUsage().heapUsed;
  const stringify = JSON.stringify;
  let calls = 0,
    codeUnits = 0;
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
    const value = stringify(...args);
    calls++;
    codeUnits += value?.length ?? 0;
    return value;
  }) as typeof JSON.stringify;
  const start = performance.now();
  try {
    for (let index = 0; index < iterations; index++) {
      if (cold && incremental) cache = new SourceKeyCache();
      evaluate(
        test.pages[index % test.pages.length]!,
        cache,
        index,
        test.stamp,
        test.originals,
        test.owned,
      );
    }
  } finally {
    JSON.stringify = stringify;
  }
  return {
    case: test.name,
    mode: incremental ? "incremental" : "canonical",
    phase: cold ? "cold-dependency-cache" : "warm",
    elapsedMs: performance.now() - start,
    iterations,
    stringifyCalls: calls,
    serializedCodeUnits: codeUnits,
    heapUsedDelta: process.memoryUsage().heapUsed - heapBefore,
    cache: cache?.stats() ?? null,
    dependencyVectorsCreated: cold
      ? null
      : (cache?.stats().dependencyVectors ?? 0) - (beforeStats?.dependencyVectors ?? 0),
    ownership: poseOwnership(test),
  };
}
const results = cases.flatMap((test) =>
  [false, true].flatMap((cold) =>
    [false, true].map((incremental) => measure(test, incremental, cold)),
  ),
);
console.log(
  JSON.stringify(
    {
      commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      workingTree: execFileSync("git", ["status", "--short"], { encoding: "utf8" }),
      runtime: process.versions,
      platform: process.platform,
      arch: process.arch,
      boundary:
        "CPU source dependencies; excludes document preparation, GPU, decoding and presentation",
      memoryNote:
        "Retained scalar payload excludes JS object/container overhead. Heap delta includes GC noise; dependency vectors are counted allocations, not total allocator bytes.",
      layerCount: layers.length,
      iterations,
      checksum,
      results,
    },
    null,
    2,
  ),
);
