/** Preparation and CPU interpolation benchmark. Rendering is measured separately in browsers.
 * bun scripts/performance/path-morph.ts [absolute-flubber-module-path]
 * Optional flubber is a benchmark-only installation, never a production dependency.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  alignClosedInto,
  interpolateInto,
  resampleClosed,
} from "../../packages/path-morph/src/index";
import type { Project } from "@musart/core";
import type { PathPoint } from "../../packages/path-morph/src/index";
const manifest = JSON.parse(
  await readFile("apps/web/public/templates/motion/morphing-type/morphing-type.json", "utf8"),
) as { project: Project };
const definition = manifest.project.pages[0]!.layers.flatMap((layer) => layer.effects).find(
  (effect) => effect.shapeMorph,
)!.shapeMorph!;
const shapes = definition.shapes.map((shape) => {
  const a = resampleClosed(shape.frames[0]!.contours[0]!.points, 256),
    b = resampleClosed(shape.frames[Math.floor(shape.frames.length / 2)]!.contours[0]!.points, 256);
  return { a, b, out: new Float64Array(512) };
});
let checksum = 0;
const legacyAlign = (a: Float64Array, b: Float64Array) => {
  let score = Infinity,
    best = 0;
  for (let shift = 0; shift < a.length; shift += 2) {
    let cost = 0;
    for (let i = 0; i < a.length; i += 2)
      cost +=
        (a[(i + shift) % a.length]! - b[i]!) ** 2 +
        (a[(i + shift + 1) % a.length]! - b[i + 1]!) ** 2;
    if (cost < score) {
      score = cost;
      best = shift;
    }
  }
  return best / 2;
};
function measure(name: string, rounds: number, run: (index: number) => void) {
  for (let i = 0; i < 20; i++) run(i);
  const start = performance.now();
  for (let i = 0; i < rounds; i++) run(i);
  const elapsedMs = performance.now() - start;
  return {
    name,
    operations: rounds * shapes.length,
    elapsedMs,
    microsecondsPerContour: (elapsedMs * 1000) / (rounds * shapes.length),
  };
}
const results = [
  measure("previous exhaustive correspondence", 200, () => {
    for (const { a, b } of shapes) checksum += legacyAlign(a, b);
  }),
  measure("typed/pruned exact correspondence", 200, () => {
    for (const { a, b, out } of shapes) checksum += alignClosedInto(a, b, out);
  }),
  measure("prepared interpolation into retained Float64 buffer", 10000, (i) => {
    for (const { a, b, out } of shapes) {
      interpolateInto(a, b, (i % 997) / 997, out);
      checksum += out[0]!;
    }
  }),
];
if (process.argv[2]) {
  type Interpolator = (t: number) => PathPoint[];
  type Factory = (
    from: PathPoint[],
    to: PathPoint[],
    options: { string: false; maxSegmentLength: number },
  ) => Interpolator;
  const module = (await import(pathToFileURL(resolve(process.argv[2])).href)) as {
    default?: { interpolate: Factory };
    interpolate?: Factory;
  };
  const flubber = module.interpolate ?? module.default?.interpolate;
  if (!flubber) throw Error("Expected the benchmark-only flubber interpolate export.");
  const ring = (a: Float64Array): PathPoint[] =>
    Array.from({ length: a.length / 2 }, (_, i) => [a[i * 2]!, a[i * 2 + 1]!]);
  const interpolators = shapes.map(
    ({ a, b }) =>
      flubber(ring(a), ring(b), { string: false, maxSegmentLength: Infinity }) as Interpolator,
  );
  if (interpolators.some((interpolate) => interpolate(0.5).length !== 256))
    throw Error("Unequal comparison point counts.");
  results.push(
    measure("flubber prepared ring interpolation (string:false, 256 vertices)", 10000, (i) => {
      for (const interpolate of interpolators) checksum += interpolate((i % 997) / 997)[0]![0];
    }),
  );
}
console.log(
  JSON.stringify(
    { runtime: process.versions, shapes: shapes.length, pointsPerShape: 256, checksum, results },
    null,
    2,
  ),
);
