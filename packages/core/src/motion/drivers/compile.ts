import { compareMotionTime, motionTimeToSeconds, subtractMotionTime, addMotionTime } from "../time";
import type { MotionTime } from "../time";
import type { MotionDriver, MotionInputEvent, MotionSpringResponse } from "./model";
import { validateMotionDriver } from "./validation";

type InputDriver = Exclude<MotionDriver, { period: MotionTime }>;
interface InputPoint {
  at: MotionTime;
  value: number;
  interpolate: boolean;
}
interface Change {
  at: MotionTime;
  step: number;
  slope: number;
}

/** Exact step and ramp responses of the same damped spring, with zero initial velocity. */
function springResponse(
  seconds: number,
  spring?: MotionSpringResponse,
): { step: number; ramp: number } {
  if (!spring) return { step: 1, ramp: seconds };
  const { frequency: omega, damping: zeta } = spring;
  const decay = Math.exp(-zeta * omega * seconds);
  let step: number, velocity: number;
  if (Math.abs(zeta - 1) < 1e-6) {
    step = 1 - (1 + omega * seconds) * decay;
    velocity = omega * omega * seconds * decay;
  } else if (zeta < 1) {
    const damped = omega * Math.sqrt(1 - zeta * zeta);
    step =
      1 -
      decay * (Math.cos(damped * seconds) + ((zeta * omega) / damped) * Math.sin(damped * seconds));
    velocity = ((omega * omega) / damped) * decay * Math.sin(damped * seconds);
  } else {
    const root = Math.sqrt(zeta * zeta - 1);
    const slow = -omega * (zeta - root),
      fast = -omega * (zeta + root);
    step = 1 + (fast * Math.exp(slow * seconds) - slow * Math.exp(fast * seconds)) / (slow - fast);
    velocity =
      (slow * fast * (Math.exp(slow * seconds) - Math.exp(fast * seconds))) / (slow - fast);
  }
  return { step, ramp: seconds - ((2 * zeta) / omega) * step - velocity / (omega * omega) };
}

function inputPoints(driver: InputDriver): InputPoint[] {
  if (driver.kind === "primaryClick" || driver.kind === "secondaryClick") {
    const points: InputPoint[] = [];
    let target = driver.initial;
    for (const event of driver.events) {
      if (event.kind !== driver.kind) continue;
      target = driver.clickMode === "impulse" ? 1 : 1 - target;
      points.push({ at: event.at, value: target, interpolate: false });
      if (driver.clickMode === "impulse") {
        // A repeated click retriggers the impulse instead of accepting an older release.
        const pending = points.at(-2);
        if (pending && compareMotionTime(pending.at, event.at) > 0)
          points.splice(points.length - 2, 1);
        points.push({
          at: addMotionTime(event.at, driver.impulseDuration ?? { value: 150, rate: 1000 }),
          value: driver.initial,
          interpolate: false,
        });
      }
    }
    return points.sort((left, right) => compareMotionTime(left.at, right.at));
  }
  let anchor: number | undefined,
    base = driver.initial,
    current = driver.initial;
  let previous: Extract<MotionInputEvent, { kind: "pointer" }> | undefined;
  const points: InputPoint[] = [];
  for (const event of driver.events) {
    if (event.kind !== "pointer") continue;
    const position = driver.kind === "pointerY" || driver.axis === "y" ? event.y : event.x;
    if (driver.kind === "pointerDrag") {
      if (event.dragging && anchor === undefined) {
        anchor = position;
        base = current;
      }
      if (anchor !== undefined) current = Math.max(0, Math.min(1, base + position - anchor));
      if (!event.dragging) {
        anchor = undefined;
        if (driver.returnOnRelease) current = driver.initial;
      }
    } else current = position;
    points.push({
      at: event.at,
      value: current,
      interpolate: Boolean(
        previous &&
        previous.dragging === event.dragging &&
        (driver.kind !== "pointerDrag" || event.dragging),
      ),
    });
    previous = event;
  }
  return points;
}

/** Stateless and seek-safe: live preview, scrub and offline export use this sampler. */
export function compileMotionDriver(driver: MotionDriver): (elapsed: MotionTime) => number {
  validateMotionDriver(driver);
  if ("period" in driver)
    return (elapsed) => {
      if (elapsed.value <= 0) return 0;
      const ticks = BigInt(elapsed.value) * BigInt(driver.period.rate);
      const period = BigInt(elapsed.rate) * BigInt(driver.period.value);
      const phase = Number(ticks % period) / Number(period);
      if (driver.kind === "pingPong") return 1 - Math.abs(2 * phase - 1);
      if (driver.kind === "pulse") return (1 - Math.cos(2 * Math.PI * phase)) / 2;
      return phase;
    };
  const points = inputPoints(driver),
    changes: Change[] = [];
  let previous = { at: { value: 0, rate: 1 }, value: driver.initial };
  for (const point of points) {
    const seconds = motionTimeToSeconds(subtractMotionTime(point.at, previous.at));
    if (point.interpolate && seconds > 0) {
      const slope = (point.value - previous.value) / seconds;
      changes.push({ at: previous.at, step: 0, slope }, { at: point.at, step: 0, slope: -slope });
    } else changes.push({ at: point.at, step: point.value - previous.value, slope: 0 });
    previous = point;
  }
  changes.sort((left, right) => compareMotionTime(left.at, right.at));
  return (elapsed) => {
    let value = driver.initial;
    for (const change of changes) {
      if (compareMotionTime(change.at, elapsed) > 0) break;
      const result = springResponse(
        motionTimeToSeconds(subtractMotionTime(elapsed, change.at)),
        driver.response,
      );
      value += change.step * result.step + change.slope * result.ramp;
    }
    return Math.max(0, Math.min(1, value));
  };
}
