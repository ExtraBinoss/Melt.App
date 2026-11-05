import type { Composition } from "../../document/model";
import { propertyDependencies } from "../../spatial/properties";
import {
  EFFECT_MOTION_PROPERTIES,
  effectMotionSchema,
  effectSettingProperties,
  readEffectMotionValue,
} from "../properties/effect";
import type { MotionValue } from "../properties/model";
import { isValidMotionValue } from "../properties/validation";
import type { SceneMotionPropertyDescriptor, SceneMotionPropertyTarget } from "./model";

type EffectTarget = Extract<
  SceneMotionPropertyTarget,
  { kind: "compositionEffect" | "compositionEffectSetting" }
>;

export function resolveCompositionEffectMotionProperty(
  page: Composition,
  target: EffectTarget,
): SceneMotionPropertyDescriptor | null {
  if (target.compositionId !== page.id) return null;
  const effect = page.effects?.find((item) => item.id === target.effectId);
  if (!effect) return null;
  const setting = target.kind === "compositionEffectSetting";
  const schema = effectMotionSchema(effect, target.property, setting);
  if (!schema) return null;
  const value = readEffectMotionValue(effect, target.property, setting);
  if (!isValidMotionValue(schema, value)) return null;
  return {
    ...schema,
    target: { ...target },
    value,
    animatable: true,
    dependencies: propertyDependencies(
      setting ? "effectSetting" : "effect",
      target.property,
      effect.type,
    ),
  } as SceneMotionPropertyDescriptor;
}

export function listCompositionEffectMotionTargets(page: Composition): EffectTarget[] {
  return (page.effects ?? []).flatMap((effect) => [
    ...EFFECT_MOTION_PROPERTIES.map((property): EffectTarget => ({
      kind: "compositionEffect",
      compositionId: page.id,
      effectId: effect.id,
      property,
    })),
    ...effectSettingProperties(effect).map((property): EffectTarget => ({
      kind: "compositionEffectSetting",
      compositionId: page.id,
      effectId: effect.id,
      property,
    })),
  ]);
}

/** Called only after the shared descriptor and value validators accepted the target. */
export function applyCompositionEffectMotionValue(
  page: Composition,
  target: EffectTarget,
  value: MotionValue,
): Composition {
  return {
    ...page,
    effects: page.effects!.map((effect) => {
      if (effect.id !== target.effectId) return effect;
      if (target.kind === "compositionEffectSetting")
        return { ...effect, settings: { ...effect.settings, [target.property]: value } };
      const result = { ...effect };
      if (target.property === "composite" && value === "default") delete result.composite;
      else Object.assign(result, { [target.property]: value });
      return result;
    }),
  };
}
