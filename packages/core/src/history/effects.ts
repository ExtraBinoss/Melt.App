import type { Effect, Layer } from "../document/model";
import { getEffectDefinition } from "../effects/catalog";
import { getEffectParameter } from "../effects/parameters";
import { EFFECT_MOTION_PROPERTIES, readEffectMotionValue } from "../motion/properties/effect";
import { type HistoryContext } from "./collector";
import type { HistoryPropertyTarget } from "./model";
import { sameLiquifyDabs } from "../effects/liquify/strokes";
import { sameMorph } from "./structural";

export function captureEffects(
  context: HistoryContext,
  layer: Layer | undefined,
  proposed: readonly Effect[],
): void {
  const readStack = () => (layer ? layer.effects : context.page.effects) ?? [];
  const before = new Map(readStack().map((effect) => [effect.id, effect]));
  const next = new Map(proposed.map((effect) => [effect.id, effect]));
  const compositionId = context.page.id,
    location = layer ? { layerId: layer.id } : {};
  for (const [effectId, old] of before) {
    const owner = {
      kind: "effect",
      compositionId,
      ...location,
      effectId,
      effectType: old.type,
    } as const;
    const effect = next.get(effectId);
    if (!effect) {
      context.history.action("delete", owner);
      continue;
    }
    if (effect.type !== old.type) {
      context.history.action("delete", owner);
      context.history.action("add", { ...owner, effectType: effect.type });
      continue;
    }
    const read = () => readStack().find((item) => item.id === effectId)!;
    for (const property of EFFECT_MOTION_PROPERTIES) {
      const target: HistoryPropertyTarget = { owner, property };
      context.history.watch(
        target,
        () => readEffectMotionValue(read(), property, false),
        readEffectMotionValue(effect, property, false),
      );
    }
    for (const parameter of getEffectDefinition(old.type).parameters) {
      if (parameter.scope !== "settings") continue;
      context.history.watch(
        { owner, property: `settings.${parameter.key}` },
        () => getEffectParameter(read(), parameter),
        getEffectParameter(effect, parameter),
      );
    }
    for (const input of getEffectDefinition(old.type).inputs ?? [])
      context.history.watch(
        { owner, property: `inputs.${input.key}` },
        () => read().inputs?.[input.key],
        effect.inputs?.[input.key],
      );
    if (!sameLiquifyDabs(old.liquify, effect.liquify)) context.history.action("geometry", owner);
    if (!sameMorph(old.shapeMorph, effect.shapeMorph)) context.history.action("geometry", owner);
  }
  for (const [effectId, effect] of next)
    if (!before.has(effectId))
      context.history.action("add", {
        kind: "effect",
        compositionId,
        ...location,
        effectId,
        effectType: effect.type,
      });
  if (
    readStack().length === proposed.length &&
    readStack().some((effect, index) => effect.id !== proposed[index]?.id)
  )
    context.history.action(
      "reorder",
      layer
        ? { kind: "layer", compositionId, layerId: layer.id }
        : { kind: "composition", compositionId },
    );
}
