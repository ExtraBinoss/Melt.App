import { expect, it } from "vitest";
import { prepareMorphShape } from "@musart/core";
import { compactPreparedMorph } from "../../../src/surface/morph/compact-prepared";
import { morphFixture } from "../../morph-fixture";
it("compacts prepared trajectories without modifying authored poses or dropping hole states", () => {
  const authored = morphFixture().shapes[0]!.frames;
  authored[1]!.contours.push({
    hole: true,
    points: [
      [0.3, 0.3],
      [0.3, 0.7],
      [0.7, 0.7],
      [0.7, 0.3],
    ],
  });
  const before = structuredClone(authored),
    prepared = prepareMorphShape(authored);
  expect([...compactPreparedMorph(prepared)].length).toBeGreaterThan(0);
  expect(authored).toEqual(before);
  expect(prepared).toHaveLength(authored.length);
  expect(prepared.map((f) => f.at)).toEqual(authored.map((f) => f.at));
  for (const f of prepared) expect(f.contours.map((c) => c.hole)).toEqual([false, true]);
  expect(prepared[0]!.contours[0]!.points.length).toBeLessThan(256);
  expect(prepared[0]!.contours[1]!.points.length).toBe(prepared[1]!.contours[1]!.points.length);
  expect(new Set(prepared[0]!.contours[1]!.points.map((p) => JSON.stringify(p))).size).toBe(1);
});
