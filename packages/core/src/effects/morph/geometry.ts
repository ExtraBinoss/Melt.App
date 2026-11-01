import { resampleClosed, alignClosedInto } from "@musart/path-morph";
import type { MorphContour, MorphPoint, MorphShapeFrame } from "./model";
const area = (points: readonly MorphPoint[]) =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
const center = (points: readonly MorphPoint[]): MorphPoint =>
  points.reduce<MorphPoint>(
    (p, q) => [p[0] + q[0] / points.length, p[1] + q[1] / points.length],
    [0, 0],
  );
/** Bounded cold geometry preparation. Missing holes collapse instead of popping or filling. */
export function* prepareMorphShapeSteps(
  frames: readonly MorphShapeFrame[],
): Generator<MorphShapeFrame> {
  const raw = frames.map((frame) =>
    [false, true].map((hole) => frame.contours.filter((c) => c.hole === hole)),
  );
  const anchors = [0, 1].map((kind) =>
    raw
      .reduce<MorphContour[]>(
        (best, group) => (group[kind]!.length > best.length ? group[kind]! : best),
        [],
      )
      .slice()
      .sort((a, b) => center(a.points)[0] - center(b.points)[0]),
  );
  const references = anchors.map((group) => group.slice());
  const groups = raw.map((group) =>
    [0, 1].map((kind) => {
      const found: (MorphContour | undefined)[] = Array.from({ length: anchors[kind]!.length });
      const used = new Set<number>();
      for (let pass = 0; pass < group[kind]!.length; pass++) {
        let best = Infinity,
          slot = -1,
          contour = -1;
        references[kind]!.forEach((reference, si) => {
          if (found[si]) return;
          const a = center(reference.points);
          group[kind]!.forEach((candidate, ci) => {
            if (used.has(ci)) return;
            const b = center(candidate.points),
              score =
                (a[0] - b[0]) ** 2 +
                (a[1] - b[1]) ** 2 +
                Math.abs(Math.abs(area(reference.points)) - Math.abs(area(candidate.points))) *
                  0.05;
            if (score < best) {
              best = score;
              slot = si;
              contour = ci;
            }
          });
        });
        if (slot >= 0) {
          found[slot] = group[kind]![contour]!;
          references[kind]![slot] = found[slot]!;
          used.add(contour);
        }
      }
      return found;
    }),
  );
  const slots = [0, 1].flatMap((kind) => anchors[kind]!.map((_, index) => ({ kind, index })));
  const previous: Float64Array[] = [];
  for (let fi = 0; fi < frames.length; fi++) {
    const frame = frames[fi]!;
    yield {
      ...frame,
      box: [...frame.box],
      contours: slots.map(({ kind, index }, slot): MorphContour => {
        const reference = anchors[kind]![index]!;
        const original = groups[fi]![kind]![index];
        const hole = kind === 1;
        let points = original
          ? [...original.points]
          : Array.from({ length: 3 }, () => center(reference.points));
        if (area(points) > 0 === hole) points.reverse();
        let prepared = resampleClosed(points, hole ? 64 : 256);
        if (previous[slot]) {
          const aligned = new Float64Array(prepared.length);
          alignClosedInto(prepared, previous[slot]!, aligned);
          prepared = aligned;
        }
        previous[slot] = prepared;
        points = Array.from(
          { length: prepared.length / 2 },
          (_, i) => [prepared[i * 2]!, prepared[i * 2 + 1]!] as MorphPoint,
        );
        return { hole, points };
      }),
    };
  }
}

/** Synchronous pure-core convenience; render preparation can yield between the same steps. */
export function prepareMorphShape(frames: readonly MorphShapeFrame[]): MorphShapeFrame[] {
  return [...prepareMorphShapeSteps(frames)];
}
