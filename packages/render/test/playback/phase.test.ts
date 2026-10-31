import { expect, it } from "vitest";
import { samplePlaybackPhase } from "../../src/playback";

const duration = { value: 12, rate: 1 };
it("shares continuous microsecond poses without reducing a 60 Hz animation to 30 Hz", () => {
  expect(samplePlaybackPhase(0.017, duration).time).toEqual({ value: 17000, rate: 1000000 });
  expect(samplePlaybackPhase(12.017, duration).time).toEqual({ value: 17000, rate: 1000000 });
  expect(samplePlaybackPhase(24, duration).time.value).toBe(0);
});
it("keeps looping samples half-open even when microsecond rounding reaches the end", () => {
  expect(samplePlaybackPhase(11.9999999, duration).time.value).toBe(11999999);
  expect(samplePlaybackPhase(12, duration).time.value).toBe(0);
  expect(samplePlaybackPhase(12, duration, "once")).toEqual({ time: duration, playing: false });
  expect(samplePlaybackPhase(13, duration, "once")).toEqual({ time: duration, playing: false });
  expect(samplePlaybackPhase(0, duration, "once").playing).toBe(true);
});
it("keeps the authored ping-pong end pose and reflects its continuous return phase", () => {
  expect(samplePlaybackPhase(12, duration, "pingPong")).toEqual({ time: duration, playing: true });
  expect(samplePlaybackPhase(13.25, duration, "pingPong").time.value).toBe(10750000);
  expect(samplePlaybackPhase(24, duration, "pingPong").time.value).toBe(0);
});
it("rejects invalid clocks and empty durations", () => {
  for (const elapsed of [-1, NaN, Infinity])
    expect(() => samplePlaybackPhase(elapsed, duration)).toThrow(RangeError);
  expect(() => samplePlaybackPhase(0, { value: 0, rate: 1 })).toThrow(RangeError);
});
