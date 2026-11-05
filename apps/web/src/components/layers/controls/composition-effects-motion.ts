import {
  applySceneMotionValues,
  listSceneMotionProperties,
  resolveSceneMotionProperty,
  sceneMotionAddress,
  type Command,
  type Composition,
  type Effect,
  type SceneMotionPropertyTarget,
} from "@musart/core";
import type { MotionEditOrigin } from "../../../state/session/motion-edit";

function touchedProperties(page: Composition, effects: Effect[], hint?: SceneMotionPropertyTarget) {
  return listSceneMotionProperties({ ...page, effects }).filter((descriptor) => {
    if (!("effectId" in descriptor.target)) return false;
    const before = resolveSceneMotionProperty(page, descriptor.target);
    return (
      before &&
      (before.value !== descriptor.value ||
        (hint && sceneMotionAddress(hint) === sceneMotionAddress(descriptor.target)))
    );
  });
}

/** Preserve untouched sampled channels while the canonical effects remain immutable. */
export function compositionEffectsMotionPreview(
  page: Composition,
  frame: Composition,
  effects: Effect[],
  hint?: SceneMotionPropertyTarget,
): Effect[] {
  const touched = new Set(
    touchedProperties(page, effects, hint).map(({ target }) => sceneMotionAddress(target)),
  );
  const proposed = { ...page, effects };
  const preserve = listSceneMotionProperties(frame).filter(
    ({ target }) =>
      "effectId" in target &&
      !touched.has(sceneMotionAddress(target)) &&
      resolveSceneMotionProperty(proposed, target),
  );
  return applySceneMotionValues(proposed, preserve).effects!;
}

/** Keys and any unkeyed structural changes share one transaction; defaults stay absent. */
export function compositionEffectsMotionCommands(
  page: Composition,
  effects: Effect[],
  origin: MotionEditOrigin,
  hint?: SceneMotionPropertyTarget,
): Command[] {
  let canonical = effects;
  const commands: Command[] = [];
  if (origin.mode === "motion")
    for (const descriptor of touchedProperties(page, effects, hint)) {
      const target = descriptor.target;
      if (!("effectId" in target)) continue;
      const armed = page.motion?.sceneProperties?.some(
        (property) =>
          property.keyframes.length &&
          sceneMotionAddress(property.target) === sceneMotionAddress(target),
      );
      if (!origin.auto && !armed) continue;
      commands.push({
        type: "upsertMotionKeyframe",
        target,
        value: descriptor.value,
        time: origin.time,
      });
      const base = page.effects!.find((effect) => effect.id === target.effectId)!;
      canonical = canonical.map((effect) => {
        if (effect.id !== base.id) return effect;
        const next = { ...effect };
        if (target.kind === "compositionEffectSetting") {
          const settings = { ...effect.settings };
          if (Object.hasOwn(base.settings ?? {}, target.property))
            settings[target.property] = base.settings![target.property]!;
          else Reflect.deleteProperty(settings, target.property);
          if (!base.settings && !Object.keys(settings).length) delete next.settings;
          else next.settings = settings;
        } else if (Object.hasOwn(base, target.property))
          Object.assign(next, { [target.property]: base[target.property] });
        else Reflect.deleteProperty(next, target.property);
        return next;
      });
    }
  if (JSON.stringify(canonical) !== JSON.stringify(page.effects ?? []))
    commands.unshift({ type: "updatePage", patch: { effects: canonical } });
  return commands;
}
