import { expect, it } from "vitest";
import {
  alignClosedInto,
  compilePathPair,
  interpolateInto,
  resampleClosed,
  correspondingIndices,
  correspondingIndicesSteps,
} from "../src/index";
import type { PathPoint } from "../src/index";
const square: PathPoint[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
it("preserves arc-length samples, collapsed paths and endpoint identity without mutating inputs", () => {
  const before = structuredClone(square);
  expect([...resampleClosed(square, 4)]).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
  expect([...resampleClosed([[0.5, 0.2]], 3)]).toEqual([0.5, 0.2, 0.5, 0.2, 0.5, 0.2]);
  const pair = compilePathPair(square, [square[2]!, square[3]!, square[0]!, square[1]!], 16);
  expect(pair.to).toEqual(pair.from);
  const out = new Float64Array(32);
  pair.interpolate(0.37, out);
  expect(out).toEqual(pair.from);
  expect(square).toEqual(before);
});
it("matches exhaustive cyclic least-squares correspondence, including ties and nonzero shifts", () => {
  for (let trial = 0; trial < 30; trial++) {
    const n = 32,
      a = new Float64Array(n),
      b = new Float64Array(n),
      out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = Math.sin(i * (trial + 1) * 0.73);
      b[i] = Math.cos(i * 0.37 + trial);
    }
    let best = 0,
      score = Infinity;
    for (let shift = 0; shift < n; shift += 2) {
      let cost = 0;
      for (let i = 0; i < n; i += 2)
        cost += (a[(i + shift) % n]! - b[i]!) ** 2 + (a[(i + shift + 1) % n]! - b[i + 1]!) ** 2;
      if (cost < score) {
        score = cost;
        best = shift;
      }
    }
    expect(alignClosedInto(a, b, out)).toBe(best / 2);
    expect([...out]).toEqual(Array.from({ length: n }, (_, i) => a[(i + best) % n]));
  }
  expect(alignClosedInto(new Float64Array(8), new Float64Array(8), new Float64Array(8))).toBe(0);
});
it("interpolates into a reused buffer, permits endpoint aliasing and rejects invalid budgets", () => {
  const a = new Float64Array([0, 1]),
    b = new Float64Array([2, 3]);
  interpolateInto(a, b, 0.5, a);
  expect([...a]).toEqual([1, 2]);
  for (const count of [0, 2, 1.5, 262145])
    expect(() => resampleClosed(square, count)).toThrow(RangeError);
  expect(() => resampleClosed([[NaN, 0]], 4)).toThrow(RangeError);
  expect(() => resampleClosed([], 4)).toThrow(RangeError);
  expect(() => interpolateInto(a, b, NaN, a)).toThrow(RangeError);
  expect(() => interpolateInto(a, [1], 0, a)).toThrow(RangeError);
  const loop = new Float64Array(8);
  expect(() => alignClosedInto(loop, loop, loop)).toThrow(RangeError);
  expect(() => alignClosedInto(loop, new Float64Array(6), new Float64Array(8))).toThrow(RangeError);
});

it("removes only shared redundant trajectories, retaining corners in every interpolated pose", () => {
  const a = resampleClosed(square, 256),
    b = resampleClosed(
      square.map(([x, y]) => [x * 0.6 + 0.1, y * 0.8 + 0.1]),
      256,
    );
  const indices = correspondingIndices([a, b]);
  expect(indices.length).toBeLessThan(16);
  for (const index of [0, 64, 128, 192]) expect([...indices]).toContain(index);
  const sample = new Float64Array(512);
  interpolateInto(a, b, 0.37, sample);
  for (let slot = 0; slot < indices.length; slot++) {
    const left = indices[slot]!,
      right = slot + 1 < indices.length ? indices[slot + 1]! : 256;
    for (let i = left + 1; i < right; i++) {
      const t = (i - left) / (right - left);
      for (const axis of [0, 1])
        expect(
          Math.abs(
            sample[i * 2 + axis]! -
              (sample[left * 2 + axis]! +
                (sample[(right % 256) * 2 + axis]! - sample[left * 2 + axis]!) * t),
          ),
        ).toBeLessThan(1e-9);
    }
  }
  expect(correspondingIndices([new Float64Array(512)])).toHaveLength(3);
  expect(() => correspondingIndices([])).toThrow(RangeError);
  expect(() => correspondingIndices([a, new Float64Array(6)])).toThrow(RangeError);
  const steps = correspondingIndicesSteps([a, b]);
  expect(steps.next().done).toBe(false);
  steps.return(new Uint16Array());
});

it("bounds trajectory deviation even with a loose requested tolerance", () => {
  const n = 48,
    tolerance = 0.1;
  const states = [0, 0.5, 1].map((phase) =>
    Float64Array.from(
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2,
          r = 1 + 0.2 * Math.sin(i * 2 + phase);
        return [Math.cos(a) * r + phase * 0.3, Math.sin(a) * r * (1 - phase * 0.2)];
      }).flat(),
    ),
  );
  const indices = correspondingIndices(states, tolerance);
  for (const state of states)
    for (let slot = 0; slot < indices.length; slot++) {
      const left = indices[slot]!,
        right = slot + 1 < indices.length ? indices[slot + 1]! : n;
      for (let i = left + 1; i < right; i++) {
        const t = (i - left) / (right - left),
          dx =
            state[i * 2]! - (state[left * 2]! + (state[(right % n) * 2]! - state[left * 2]!) * t),
          dy =
            state[i * 2 + 1]! -
            (state[left * 2 + 1]! + (state[(right % n) * 2 + 1]! - state[left * 2 + 1]!) * t);
        expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(tolerance + 1e-12);
      }
    }
});
