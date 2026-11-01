import { expect, test } from "vitest";
import { createEncodedSizeTracker } from "../../src/export/encoded-size";

test("waits for a full GOP and extrapolates actual packet bytes without retaining packets", () => {
  const size = createEncodedSizeTracker(10);
  size.video({ byteLength: 100_000, duration: 0.1 });
  expect(size.estimate()).toBeNull();
  size.video({ byteLength: 20_000, duration: 1.9 });
  expect(size.estimate()).toBe(600_000);
  size.video({ byteLength: 30_000, duration: 3 });
  expect(size.estimate()).toBe(300_000);
});

test("tracks audio and video independently despite encoder latency and unequal packet durations", () => {
  const size = createEncodedSizeTracker(4, true);
  size.video({ byteLength: 100_000, duration: 4 });
  expect(size.estimate()).toBeNull();
  size.audio({ byteLength: 24_000, duration: 1 });
  expect(size.estimate()).toBeNull();
  size.audio({ byteLength: 24_000, duration: 1 });
  expect(size.estimate()).toBe(196_000);
});

test("rejects unusable metadata and does not invent an estimate for empty media", () => {
  const size = createEncodedSizeTracker(0.5);
  for (const packet of [
    { byteLength: NaN, duration: 1 },
    { byteLength: -1, duration: 1 },
    { byteLength: 100, duration: 0 },
    { byteLength: 100, duration: Infinity },
  ])
    size.video(packet);
  expect(size.estimate()).toBeNull();
  size.video({ byteLength: 1000, duration: 0.5 });
  expect(size.estimate()).toBe(1000);
  for (const duration of [0, -1, NaN, Infinity])
    expect(createEncodedSizeTracker(duration).estimate()).toBeNull();
});
