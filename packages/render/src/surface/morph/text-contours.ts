import type { MorphContour, MorphPoint } from "@musart/core";
import type { PathCommand } from "../text/outlines";
import { quadraticCurves } from "../text/curves";

const signedArea = (points: readonly MorphPoint[]) =>
  points.reduce((a, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return a + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
export function glyphContours(
  commands: PathCommand[],
  box: { x1: number; y1: number; x2: number; y2: number },
): MorphContour[] {
  const groups: PathCommand[][] = [];
  for (const command of commands) {
    if (command.type === "M") groups.push([]);
    groups.at(-1)?.push(command);
  }
  const points = groups
    .map((group) =>
      quadraticCurves(group).flatMap((curve) =>
        Array.from({ length: 4 }, (_, i): MorphPoint => {
          const t = i / 4,
            s = 1 - t;
          return [
            (s * s * curve.p0[0] + 2 * s * t * curve.p1[0] + t * t * curve.p2[0] - box.x1) /
              (box.x2 - box.x1),
            (s * s * curve.p0[1] + 2 * s * t * curve.p1[1] + t * t * curve.p2[1] - box.y1) /
              (box.y2 - box.y1),
          ];
        }),
      ),
    )
    .filter((loop) => loop.length >= 3);
  const outer = points.reduce(
    (best, p) => (Math.abs(signedArea(p)) > Math.abs(signedArea(best)) ? p : best),
    points[0] ?? [],
  );
  const sign = Math.sign(signedArea(outer));
  return points.map((loop) => ({ hole: Math.sign(signedArea(loop)) !== sign, points: loop }));
}

/** A small outline offset retains stems, corners and counters instead of replacing letters with blobs. */
export function inflateContours(contours: MorphContour[], amount: number): MorphContour[] {
  const distance = Math.max(0, Math.min(1, amount)) * 0.025;
  if (!distance) return contours;
  return contours.map((contour) => {
    const direction = Math.sign(signedArea(contour.points)) * (contour.hole ? -1 : 1);
    const points = contour.points.map((point, i): MorphPoint => {
      const previous = contour.points[(i - 1 + contour.points.length) % contour.points.length]!,
        next = contour.points[(i + 1) % contour.points.length]!;
      const edge = (a: MorphPoint, b: MorphPoint): MorphPoint => {
        const x = b[0] - a[0],
          y = b[1] - a[1],
          length = Math.hypot(x, y) || 1;
        return [(direction * y) / length, (-direction * x) / length];
      };
      const a = edge(previous, point),
        b = edge(point, next),
        denominator = Math.max(0.5, 1 + a[0] * b[0] + a[1] * b[1]);
      return [
        Math.max(
          0,
          Math.min(
            1,
            (point[0] + (distance * (a[0] + b[0])) / denominator + distance) / (1 + 2 * distance),
          ),
        ),
        Math.max(
          0,
          Math.min(
            1,
            (point[1] + (distance * (a[1] + b[1])) / denominator + distance) / (1 + 2 * distance),
          ),
        ),
      ];
    });
    return { ...contour, points };
  });
}
