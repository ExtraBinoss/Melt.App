import type { Composition } from "../../document/model";
import { assertList, assertRecord, assertUniqueId } from "../../document/guards";
import { ensure } from "../../errors";
import { validateMotionEasing } from "../easing";
import { validateMotionValue } from "../properties/validation";
import { compareMotionTime, validateMotionTime, type MotionTime } from "../time";
import type { SceneMotionPropertyTarget } from "./model";
import { resolveSceneMotionProperty, sceneMotionAddress } from "./properties";
export function validateSceneMotionProperties(
  page: Composition,
  value: unknown,
  ids: Set<string>,
): number {
  if (value === undefined) return 0;
  assertList(value, 1024);
  const addresses = new Set<string>();
  let keys = 0;
  for (const property of value) {
    assertRecord(property);
    assertUniqueId(property.id, ids);
    assertRecord(property.target);
    const allowed =
      property.target.kind === "light"
        ? ["kind", "compositionId", "lightId", "property"]
        : ["kind", "compositionId", "property"];
    ensure(
      Object.keys(property.target).every((key) => allowed.includes(key)),
      "INVALID_DOCUMENT",
      "Unknown scene Motion target field",
    );
    const target = property.target as unknown as SceneMotionPropertyTarget;
    const descriptor = resolveSceneMotionProperty(page, target);
    ensure(descriptor, "INVALID_DOCUMENT", "Unknown scene Motion property");
    const address = sceneMotionAddress(target);
    ensure(!addresses.has(address), "INVALID_DOCUMENT", "Duplicate scene Motion property");
    addresses.add(address);
    assertList(property.keyframes, 100000);
    let previous: MotionTime | undefined;
    for (const key of property.keyframes) {
      ensure(++keys <= 100000, "INVALID_DOCUMENT", "Too many scene Motion keys");
      assertRecord(key);
      assertUniqueId(key.id, ids);
      validateMotionTime(key.time);
      ensure(
        (page.motion!.version === 2 || key.time.value >= 0) &&
          (!previous || compareMotionTime(previous, key.time) < 0),
        "INVALID_DOCUMENT",
        "Unordered or duplicate scene Motion key time",
      );
      validateMotionValue(descriptor, key.value);
      if (key.easing !== undefined) validateMotionEasing(key.easing);
      previous = key.time;
    }
  }
  return keys;
}
