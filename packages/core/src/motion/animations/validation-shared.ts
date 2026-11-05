import { assertList, assertNumber, assertRecord } from "../../document/guards";
import { ensure } from "../../errors";
import { validateMotionEasing } from "../easing";
import { validateMotionValue } from "../properties/validation";
import type { MotionPropertySchema } from "../properties/model";
import { validateMotionDriver } from "../drivers/validation";
export const ANIMATION_CATEGORIES = [
  "typography",
  "move",
  "scale",
  "rotate",
  "blur",
  "attention",
  "reveal",
  "stylize",
  "custom",
] as const;
export function validateAnimationPresetHeader(
  value: unknown,
): asserts value is Record<string, unknown> & { channels: unknown[]; effects: unknown[] } {
  assertRecord(value);
  ensure(
    value.version === 1 &&
      typeof value.id === "string" &&
      value.id.length > 0 &&
      value.id.length <= 200,
    "INVALID_DOCUMENT",
    "Invalid animation preset identity",
  );
  ensure(
    typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 100,
    "INVALID_DOCUMENT",
    "Invalid animation name",
  );
  ensure(
    ANIMATION_CATEGORIES.some((category) => category === value.category),
    "INVALID_DOCUMENT",
    "Unknown animation category",
  );
  assertNumber(value.duration, 1, 3600000);
  assertList(value.effects, 32);
  assertList(value.channels, 64);
  ensure(value.channels.length > 0, "INVALID_DOCUMENT", "Animation has no channels");
}
export function validateAnimationChannelPoints(
  channel: Record<string, unknown>,
  schema: MotionPropertySchema,
): void {
  if (channel.driver !== undefined) validateMotionDriver(channel.driver);
  ensure(
    ["add", "multiply", "replace"].includes(String(channel.operation)),
    "INVALID_DOCUMENT",
    "Invalid animation operation",
  );
  assertList(channel.points, 256);
  ensure(channel.points.length >= 2, "INVALID_DOCUMENT", "Animation needs at least two points");
  let previous = -1;
  for (const point of channel.points) {
    assertRecord(point);
    assertNumber(point.at, 0, 1);
    ensure(point.at > previous, "INVALID_DOCUMENT", "Unordered animation points");
    previous = point.at;
    if (channel.operation === "replace" && !channel.unit) validateMotionValue(schema, point.value);
    else {
      ensure(
        schema.kind === "number" || schema.kind === "integer",
        "INVALID_DOCUMENT",
        "Relative animation requires numbers",
      );
      assertNumber(point.value, -1000000, 1000000);
    }
    if (point.easing !== undefined) validateMotionEasing(point.easing);
  }
  ensure(
    (channel.points[0] as { at: number }).at === 0 &&
      (channel.points.at(-1) as { at: number }).at === 1,
    "INVALID_DOCUMENT",
    "Animation endpoints must span zero to one",
  );
}
