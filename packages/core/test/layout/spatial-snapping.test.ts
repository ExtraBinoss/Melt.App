import { expect, test } from "vitest";
import {
  SpatialSnapIndex,
  type SnapBounds3,
  type SnapVector,
} from "../../src/layout/snapping/spatial";
const point = (id: string, p: SnapVector): SnapBounds3 => ({ id, min: p, max: p });
const project = (p: SnapVector) => ({ x: p[0] * 100, y: p[1] * 100, visible: p[2] < 10 });
const make = () =>
  new SpatialSnapIndex(point("moving", [0, 0, 0]), [
    point("object", [1, 2, 0]),
    { ...point("center", [0, 0, 0]), kind: "page" },
  ]);
test("screen tolerance attracts centers, respects active axes and reports the achieved constraints", () => {
  const s = make();
  const r = s.snap([0.95, 1.96, 0.3], [0, 1], project, 6);
  expect(r.correction).toEqual([expect.closeTo(0.05), expect.closeTo(0.04), 0]);
  expect(r.cues).toHaveLength(2);
  expect(r.cues.map((cue) => cue.targetId)).toEqual(["object", "object"]);
  expect(r.cues[0]!.from).toEqual([1, 2, 0.3]);
  s.clear();
  expect(s.snap([0.939, 2, 0], [0], project, 6).cues).toHaveLength(0);
  expect(s.snap([0.95, 1.96, 0.3], [0], project, 6).correction[1]).toBe(0);
});
test("a captured target stays engaged until the release radius, then reacquires normally", () => {
  const s = make();
  expect(s.snap([0.95, 0, 0], [0], project, 6).cues[0]?.targetId).toBe("object");
  expect(s.snap([0.92, 0, 0], [0], project, 6).cues[0]?.targetId).toBe("object");
  expect(s.snap([0.9, 0, 0], [0], project, 6).cues).toHaveLength(0);
  expect(s.snap([0.92, 0, 0], [0], project, 6).cues).toHaveLength(0);
  expect(s.snap([0.96, 0, 0], [0], project, 6).cues).toHaveLength(1);
  expect(s.snap([0.96, 0, 0], [0], project, 6, false).cues).toHaveLength(0);
  expect(s.snap([0.92, 0, 0], [0], project, 6).cues).toHaveLength(0);
});
test("projection controls zoom/perspective tolerance and rejects hidden or view-parallel depth targets", () => {
  const s = make();
  expect(s.snap([0.95, 0, 0], [0], (p) => ({ ...project(p), x: p[0] * 200 }), 6).cues).toHaveLength(
    0,
  );
  expect(s.snap([0, 0, 0.05], [2], project, 6).cues).toHaveLength(0);
  const perspective = (p: SnapVector) => ({
    x: (p[0] * 100) / (5 - p[2]),
    y: (p[1] * 100) / (5 - p[2]),
    visible: p[2] < 5,
  });
  expect(s.snap([0.8, 0, 0], [0], perspective, 6).cues).toHaveLength(1);
  s.clear();
  expect(s.snap([0.8, 0, 4], [0], perspective, 6).cues).toHaveLength(0);
  expect(s.snap([0.95, 0, 11], [0], project, 6).cues).toHaveLength(0);
  const behind = new SpatialSnapIndex(point("moving", [0, 0, 0]), [point("behind", [1, 0, 11])]);
  expect(behind.snap([0.95, 0, 0], [0], project, 6).cues).toHaveLength(0);
});
test("transformed bounds use their edges/centers; 10,000 references retain bounded queries", () => {
  const moving: SnapBounds3 = { id: "moving", min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
  const references = Array.from({ length: 10000 }, (_, i) =>
    point(`item-${i}`, [i + 2, i % 20, i % 7]),
  );
  const s = new SpatialSnapIndex(moving, references);
  const r = s.snap([1.45, 0, 0], [0], project, 6);
  expect(r.correction[0]).toBeCloseTo(0.05);
  expect(r.cues[0]!.from[0]).toBe(2);
  expect(r.checks).toBeLessThanOrEqual(36);
  expect(() => s.snap([NaN, 0, 0], [0], project, 6)).toThrow(RangeError);
  expect(() => new SpatialSnapIndex(point("bad", [Infinity, 0, 0]), [])).toThrow(RangeError);
});

test("free translation keeps its camera-facing plane while satisfying two world constraints", () => {
  const s = new SpatialSnapIndex(point("moving", [0, 0, 0]), [point("target", [1, 1, 1])]);
  const r = s.snap([0.97, 0.97, 0.97], [0, 1, 2], project, 6, true, [1, 1, 1]);
  expect(r.correction[0] + r.correction[1] + r.correction[2]).toBeCloseTo(0);
  expect(r.correction[1]).toBeCloseTo(0.03);
  expect(r.correction[2]).toBeCloseTo(0.03);
  expect(r.cues).toHaveLength(2);
  const front = s.snap([0.97, 0.97, 0.97], [0, 1, 2], project, 6, true, [0, 0, 1]);
  expect(front.correction[2]).toBe(0);
  expect(() => s.snap([0, 0, 0], [0, 1, 2], project, 6, true, [0, 0, 0])).toThrow(RangeError);
});
