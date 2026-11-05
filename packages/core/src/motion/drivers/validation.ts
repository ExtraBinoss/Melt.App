import { assertList, assertNumber, assertRecord } from "../../document/guards";
import { ensure } from "../../errors";
import { compareMotionTime, validateMotionTime } from "../time";
import type { MotionDriver } from "./model";

export function validateMotionDriver(value: unknown): asserts value is MotionDriver {
  assertRecord(value);
  const timed = value.kind === "loop" || value.kind === "pingPong" || value.kind === "pulse";
  ensure(
    timed ||
      [
        "pointerX",
        "pointerY",
        "pointerXY",
        "pointerDrag",
        "primaryClick",
        "secondaryClick",
      ].includes(String(value.kind)),
    "INVALID_DOCUMENT",
    "Unknown motion driver",
  );
  const fields = timed
    ? ["kind", "period"]
    : [
        "kind",
        "axis",
        "initial",
        "response",
        "events",
        "returnOnRelease",
        "clickMode",
        "impulseDuration",
      ];
  ensure(
    Object.keys(value).every((key) => fields.includes(key)),
    "INVALID_DOCUMENT",
    "Unexpected driver field",
  );
  if (timed) {
    validateMotionTime(value.period);
    ensure(value.period.value > 0, "INVALID_DOCUMENT", "Driver period must be positive");
    assertNumber(value.period.value / value.period.rate, 0.001, 3600);
    return;
  }
  assertNumber(value.initial, 0, 1);
  ensure(
    value.axis === undefined || value.axis === "x" || value.axis === "y",
    "INVALID_DOCUMENT",
    "Invalid pointer axis",
  );
  if (value.response !== undefined) {
    assertRecord(value.response);
    ensure(
      Object.keys(value.response).every((key) => key === "frequency" || key === "damping"),
      "INVALID_DOCUMENT",
      "Unexpected spring field",
    );
    assertNumber(value.response.frequency, 0.1, 100);
    assertNumber(value.response.damping, 0.01, 2);
  }
  ensure(
    value.returnOnRelease === undefined ||
      (value.kind === "pointerDrag" && typeof value.returnOnRelease === "boolean"),
    "INVALID_DOCUMENT",
    "Invalid drag release behavior",
  );
  const click = value.kind === "primaryClick" || value.kind === "secondaryClick";
  ensure(
    value.clickMode === undefined ||
      (click && (value.clickMode === "toggle" || value.clickMode === "impulse")),
    "INVALID_DOCUMENT",
    "Invalid click behavior",
  );
  if (value.impulseDuration !== undefined) {
    ensure(
      click && value.clickMode === "impulse",
      "INVALID_DOCUMENT",
      "Impulse duration requires an impulse driver",
    );
    validateMotionTime(value.impulseDuration);
    assertNumber(value.impulseDuration.value / value.impulseDuration.rate, 0.001, 60);
  }
  assertList(value.events, 512);
  let previous = { value: 0, rate: 1 };
  for (const event of value.events) {
    assertRecord(event);
    validateMotionTime(event.at);
    ensure(
      compareMotionTime(event.at, previous) >= 0,
      "INVALID_DOCUMENT",
      "Unordered motion input events",
    );
    previous = event.at;
    const pointer = event.kind === "pointer";
    ensure(
      pointer || event.kind === "primaryClick" || event.kind === "secondaryClick",
      "INVALID_DOCUMENT",
      "Unknown motion input event",
    );
    ensure(
      Object.keys(event).every((key) =>
        (pointer ? ["kind", "at", "x", "y", "dragging"] : ["kind", "at"]).includes(key),
      ),
      "INVALID_DOCUMENT",
      "Unexpected motion input field",
    );
    if (pointer) {
      assertNumber(event.x, 0, 1);
      assertNumber(event.y, 0, 1);
      ensure(typeof event.dragging === "boolean", "INVALID_DOCUMENT", "Invalid pointer drag state");
    }
  }
}
