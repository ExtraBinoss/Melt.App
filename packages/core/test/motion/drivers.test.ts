import { expect, it } from "vitest";
import { compileMotionDriver, validateMotionDriver } from "../../src/index";
import type { MotionDriver, MotionInputEvent } from "../../src/index";

const at = (seconds: number) => ({ value: Math.round(seconds * 1000), rate: 1000 });
const pointer = (seconds: number, x: number, dragging = false): MotionInputEvent => ({
  kind: "pointer",
  at: at(seconds),
  x,
  y: 0.5,
  dragging,
});

it("samples rational timed curves without accumulated playback state", () => {
  for (const kind of ["loop", "pingPong", "pulse"] as const) {
    const sample = compileMotionDriver({ kind, period: at(2) });
    expect(sample(at(1))).toBeCloseTo(kind === "loop" ? 0.5 : 1);
    expect(sample(at(0))).toBe(0);
    expect(sample(at(2.5))).toBeCloseTo(sample(at(0.5)));
    expect(sample(at(86400.5))).toBeCloseTo(sample(at(0.5)));
  }
});

it("maps drag displacement from its captured origin and retains release semantics", () => {
  const driver: MotionDriver = {
    kind: "pointerDrag",
    initial: 0.5,
    events: [
      pointer(1, 0.8, true),
      pointer(2, 0.9, true),
      pointer(2, 0.9),
      pointer(3, 0.1, true),
      pointer(4, 0.3, true),
    ],
  };
  const hold = compileMotionDriver(driver);
  expect(hold(at(1))).toBeCloseTo(0.5);
  expect(hold(at(1.5))).toBeCloseTo(0.55);
  expect(hold(at(2))).toBeCloseTo(0.6);
  expect(hold(at(4))).toBeCloseTo(0.8);
  const rebound = compileMotionDriver({ ...driver, returnOnRelease: true });
  expect(rebound(at(2))).toBeCloseTo(0.5);
  expect(rebound(at(4))).toBeCloseTo(0.7);
});

it("reconstructs simplified linear input with exact critically damped ramp response", () => {
  const sample = compileMotionDriver({
    kind: "pointerX",
    initial: 0,
    response: { frequency: 2, damping: 1 },
    events: [pointer(0, 0), pointer(1, 1)],
  });
  const expected = 0.5 - 1 + 1.5 * Math.exp(-1);
  expect(sample(at(0.5))).toBeCloseTo(expected);
  const final = sample(at(2));
  sample(at(0.1));
  expect(sample(at(2))).toBe(final);
  expect(sample(at(0))).toBe(0);
});

it("click impulses retrigger with authored duration and toggles remain discrete", () => {
  const events: MotionInputEvent[] = [
    { kind: "primaryClick", at: at(1) },
    { kind: "primaryClick", at: at(1.1) },
  ];
  const impulse = compileMotionDriver({
    kind: "primaryClick",
    initial: 0,
    clickMode: "impulse",
    events,
  });
  expect(impulse(at(0.9))).toBe(0);
  expect(impulse(at(1.2))).toBe(1);
  expect(impulse(at(1.3))).toBe(0);
  const toggle = compileMotionDriver({ kind: "primaryClick", initial: 0, events });
  expect(toggle(at(1))).toBe(1);
  expect(toggle(at(1.1))).toBe(0);
});

it("rejects invalid portable driver options and out-of-order input", () => {
  expect(() => validateMotionDriver({ kind: "loop", period: at(0) })).toThrow();
  expect(() =>
    validateMotionDriver({
      kind: "pointerX",
      initial: 0.5,
      events: [pointer(2, 0.5), pointer(1, 0.2)],
    }),
  ).toThrow();
  expect(() =>
    validateMotionDriver({ kind: "pointerDrag", initial: 0.5, events: [], clickMode: "impulse" }),
  ).toThrow();
});
