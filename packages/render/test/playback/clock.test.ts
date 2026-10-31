import { expect, it } from "vitest";
import { BufferedPlaybackClock, PLAYBACK_FRAME_CREDIT_MS } from "../../src/playback";

it("uses one sampled unwrapped phase and bounds preparation credit without catch-up", () => {
  let now = 0;
  const clock = new BufferedPlaybackClock(() => now);
  clock.start(11.9);
  now = 100;
  expect(clock.read()).toBe(12);
  const release = clock.hold(PLAYBACK_FRAME_CREDIT_MS);
  now = 2100;
  expect(clock.read()).toBe(12);
  expect(release()).toBe(true);
  expect(release()).toBe(false);
  now += 10;
  expect(clock.read()).toBeCloseTo(12.0433333);
  clock.stop();
  now += 5000;
  expect(clock.read()).toBeCloseTo(12.0433333);
});

it("nested holds and native audio delay do not resume early or affect replacement playback", () => {
  let now = 0;
  const clock = new BufferedPlaybackClock(() => now);
  clock.start(0);
  const a = clock.hold(),
    b = clock.hold();
  now = 2000;
  expect(a()).toBe(false);
  expect(clock.blocked).toBe(true);
  expect(b(10)).toBe(true);
  now += 5;
  expect(clock.read()).toBe(0);
  now += 25;
  expect(clock.read()).toBe(0.02);
  const stale = clock.hold();
  clock.start(4);
  const current = clock.hold();
  expect(stale()).toBe(false);
  expect(clock.blocked).toBe(true);
  current();
  expect(clock.read()).toBe(4);
});

it("validates time, credit and delay, even on a repeated release", () => {
  const clock = new BufferedPlaybackClock(() => 0);
  expect(clock.hold()()).toBe(false);
  expect(() => clock.start(-1)).toThrow(RangeError);
  expect(() => clock.stop(NaN)).toThrow(RangeError);
  for (const credit of [-1, Infinity, 101]) expect(() => clock.hold(credit)).toThrow(RangeError);
  clock.start(0);
  const release = clock.hold();
  expect(() => release(-1)).toThrow(RangeError);
  release();
  expect(() => release(Infinity)).toThrow(RangeError);
});
