import { createSpatialScene } from "../../spatial/defaults";
import type { Composition } from "../../document/model";
import { ensure } from "../../errors";
import type { MotionCommand } from "../model";
import { validateMotionValue } from "../properties/validation";
import { compareMotionTime, validateMotionTime } from "../time";
import { resolveSceneMotionProperty, sceneMotionAddress } from "./properties";
import type { SceneMotionPropertyTarget } from "./model";

export function upsertSceneMotionKeyframe(
  page: Composition,
  command: Extract<MotionCommand, { type: "upsertMotionKeyframe" }>,
  nextId: (prefix: string) => string,
  pageId: string,
) {
  const target = command.target as SceneMotionPropertyTarget;
  const motion = page.motion!;
  if (!page.spatial && (target.kind === "camera" || target.kind === "environment")) {
    const scene = createSpatialScene();
    page.spatial = {
      ...scene,
      lights: scene.lights.map((light) => ({ ...light, id: nextId("light") })),
    };
  }
  ensure(
    command.trackId === undefined,
    "INVALID_COMMAND",
    "Scene channels have no layer occurrence",
  );
  const descriptor = resolveSceneMotionProperty(page, target);
  ensure(descriptor, "INVALID_COMMAND", "Unknown scene Motion property");
  validateMotionValue(descriptor, command.value);
  validateMotionTime(command.time);
  ensure(
    motion.version === 2 || command.time.value >= 0,
    "INVALID_COMMAND",
    "Negative keyframe time",
  );
  const properties = (motion.sceneProperties ??= []);
  let property = properties.find(
    (item) => sceneMotionAddress(item.target) === sceneMotionAddress(target),
  );
  if (!property) {
    property = { id: nextId("property"), target: { ...target }, keyframes: [] };
    properties.push(property);
  }
  const existing = property.keyframes.find(
    (key) => compareMotionTime(key.time, command.time) === 0,
  );
  if (existing) {
    existing.value = command.value;
    if (command.easing !== undefined) existing.easing = command.easing;
  } else {
    property.keyframes.push({
      id: nextId("key"),
      time: command.time,
      value: command.value,
      ...(command.easing === undefined ? {} : { easing: command.easing }),
    });
    property.keyframes.sort((a, b) => compareMotionTime(a.time, b.time));
  }
  return { pageId };
}
