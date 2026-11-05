import { EFFECT_CATALOG } from "../../../effects/catalog";
import { effectMotionSchema } from "../../properties/effect";
import type { Composition } from "../../../document/model";
import { assertList, assertNumber, assertRecord, assertUniqueId } from "../../../document/guards";
import { ensure } from "../../../errors";
import {
  validateAnimationPresetHeader,
  validateAnimationChannelPoints,
} from "../../animations/validation-shared";
import { validateMotionTime } from "../../time";
import {
  CAMERA_MOTION_SCHEMAS,
  ENVIRONMENT_MOTION_SCHEMAS,
  LIGHT_MOTION_SCHEMAS,
} from "../properties";
import type { MotionPropertySchema } from "../../properties/model";
import type { SceneMotionAnimationPreset, SceneAnimationOwner } from "./model";
import { canApplySceneMotionAnimationPreset } from "./targets";
export function validateSceneMotionAnimationPreset(
  value: unknown,
): asserts value is SceneMotionAnimationPreset {
  validateAnimationPresetHeader(value);
  ensure(
    value.effects.length === 0,
    "INVALID_DOCUMENT",
    "Scene animations do not own layer effects",
  );
  const addresses = new Set<string>();
  let ownerKind: string | undefined;
  for (const channel of value.channels) {
    assertRecord(channel);
    assertRecord(channel.target);
    const target = channel.target;
    ensure(
      Object.keys(target).every((key) => key === "kind" || key === "property") &&
        typeof target.property === "string",
      "INVALID_DOCUMENT",
      "Unexpected scene animation target",
    );
    ensure(
      channel.unit === undefined,
      "INVALID_DOCUMENT",
      "Scene animations have no layer distance unit",
    );
    const schemas =
      target.kind === "camera"
        ? CAMERA_MOTION_SCHEMAS
        : target.kind === "environment"
          ? ENVIRONMENT_MOTION_SCHEMAS
          : target.kind === "light"
            ? LIGHT_MOTION_SCHEMAS
            : null;
    const effectSchemas =
      target.kind === "compositionEffect" || target.kind === "compositionEffectSetting"
        ? Object.values(EFFECT_CATALOG).flatMap((definition) => {
            const schema = effectMotionSchema(
              { ...definition.defaults, id: "preset-validation", type: definition.type },
              target.property as string,
              target.kind === "compositionEffectSetting",
            );
            return schema ? [schema] : [];
          })
        : [];
    ensure(
      (schemas && Object.hasOwn(schemas, target.property)) || effectSchemas.length > 0,
      "INVALID_DOCUMENT",
      "Unknown scene animation property",
    );
    const channelOwnerKind =
      target.kind === "compositionEffectSetting" ? "compositionEffect" : target.kind;
    ensure(
      ownerKind === undefined || ownerKind === channelOwnerKind,
      "INVALID_DOCUMENT",
      "Scene animation channels must share their owner kind",
    );
    ownerKind = String(channelOwnerKind);
    const address = JSON.stringify([target.kind, target.property]);
    ensure(!addresses.has(address), "INVALID_DOCUMENT", "Duplicate animation channel");
    addresses.add(address);
    if (effectSchemas.length) {
      ensure(
        effectSchemas.some((schema) => {
          try {
            validateAnimationChannelPoints(channel, schema);
            return true;
          } catch {
            return false;
          }
        }),
        "INVALID_DOCUMENT",
        "Invalid composition effect animation values",
      );
    } else
      validateAnimationChannelPoints(
        channel,
        (schemas as Record<string, MotionPropertySchema>)[target.property]!,
      );
  }
}
export function validateSceneMotionAnimations(
  page: Composition,
  value: unknown,
  ids: Set<string>,
): number {
  if (value === undefined) return 0;
  assertList(value, 128);
  let count = 0;
  for (const animation of value) {
    assertRecord(animation);
    assertUniqueId(animation.id, ids);
    assertRecord(animation.owner);
    const owner = animation.owner;
    ensure(
      Object.keys(owner).every((key) =>
        [
          "kind",
          "compositionId",
          ...(owner.kind === "light"
            ? ["lightId"]
            : owner.kind === "compositionEffect"
              ? ["effectId"]
              : []),
        ].includes(key),
      ),
      "INVALID_DOCUMENT",
      "Unexpected scene animation owner field",
    );
    validateSceneMotionAnimationPreset(animation.preset);
    ensure(
      canApplySceneMotionAnimationPreset(
        page,
        owner as unknown as SceneAnimationOwner,
        animation.preset,
      ),
      "INVALID_DOCUMENT",
      "Scene animation owner is missing or mismatched",
    );
    validateMotionTime(animation.start);
    validateMotionTime(animation.duration);
    ensure(
      animation.start.value >= 0 &&
        animation.duration.value > 0 &&
        typeof animation.enabled === "boolean",
      "INVALID_DOCUMENT",
      "Invalid animation interval",
    );
    assertNumber(animation.strength, 0, 10);
    assertList(animation.effectIds, 0);
    count += animation.preset.channels.reduce((sum, channel) => sum + channel.points.length, 0);
  }
  return count;
}
