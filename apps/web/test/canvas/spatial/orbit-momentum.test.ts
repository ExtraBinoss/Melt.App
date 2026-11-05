import { expect, test } from "vitest";
import { OrbitMomentum } from "../../../src/canvas/spatial/orbit-momentum";

function release(inputHz = 60, pause = 0, speed = 2) {
  const motion = new OrbitMomentum();
  motion.begin({ yaw: 0, pitch: 0 }, 0);
  for (let i = 1; i <= inputHz / 2; i++) {
    const t = i / inputHz;
    motion.sample({ yaw: t * speed, pitch: t * speed / 4 }, t * 1000);
  }
  return { motion, moving: motion.release(500 + pause), now: 500 + pause };
}
function integrate(hz: number) {
  const { motion, now } = release();
  let yaw = 0, pitch = 0;
  for (let i = 1; i < 200 && motion.moving; i++) {
    const delta = motion.step(now + i * 1000 / hz);
    yaw += delta.yaw; pitch += delta.pitch;
  }
  expect(motion.moving).toBe(false);
  return { yaw, pitch };
}
test("inertia decays to the same bounded pose at 30, 60 and 120 Hz", () => {
  const slow = integrate(30), fast = integrate(120);
  expect(slow.yaw).toBeGreaterThan(.2);
  expect(slow.yaw).toBeLessThan(.4);
  expect(slow.yaw).toBeCloseTo(fast.yaw, 9);
  expect(integrate(60).pitch).toBeCloseTo(fast.pitch, 9);
});
test("launch velocity follows gesture speed and decays while the pointer is held still", () => {
  const slow = release(60, 0, .2), fast = release(120, 0, 2);
  expect(fast.motion.step(550).yaw).toBeGreaterThan(slow.motion.step(550).yaw * 8);
  expect(release(60, 500).moving).toBe(false);
  const capped = release(60, 0, 30);
  expect(capped.motion.step(2000).yaw).toBeLessThan(.65);
});
test("Euler wrap retains direction and stop discards every remaining sample", () => {
  const motion = new OrbitMomentum();
  motion.begin({ yaw: Math.PI - .02, pitch: 0 }, 0);
  motion.sample({ yaw: -Math.PI + .02, pitch: 0 }, 20);
  expect(motion.release(20)).toBe(true);
  expect(motion.step(40).yaw).toBeGreaterThan(0);
  motion.stop();
  expect(motion.moving).toBe(false);
  expect(motion.step(1000)).toEqual({ yaw: 0, pitch: 0 });
});
