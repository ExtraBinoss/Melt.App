import { getEffectDefinition, type Effect } from "@musart/core";
/** Keep reference rendering, primitive admission and source preparation on the same identity rule. */
export function hasEffectTreatment(effect: Effect): boolean {
  return (
    effect.enabled &&
    !(
      getEffectDefinition(effect.type).identityAtZero &&
      effect.amount === 0 &&
      !effect.composite &&
      (!effect.blendMode || effect.blendMode === "normal")
    )
  );
}
