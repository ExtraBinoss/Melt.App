import type { Composition, Effect, Layer } from "@musart/core";
export interface EffectAnimationChild {
  id: string;
  name: string;
  animationId?: string;
  action?: "automatic" | "interactive";
}
/** Project references to the authoritative animation, never a copied action. */
export function effectAnimationChildren(
  page: Composition,
  effect: Effect,
  layer?: Layer,
): EffectAnimationChild[] {
  const children: EffectAnimationChild[] = [];
  for (const action of ["automatic", "interactive"] as const) {
    const binding = effect.motion?.[action];
    if (binding) children.push({ id: action, name: binding.name, action });
  }
  if (layer) {
    for (const animation of page.motion?.tracks.find((track) => track.layerId === layer.id)
      ?.animations ?? [])
      if (animation.effectIds.includes(effect.id))
        children.push({ id: animation.id, name: animation.preset.name, animationId: animation.id });
  } else {
    for (const animation of page.motion?.sceneAnimations ?? [])
      if (animation.owner.kind === "compositionEffect" && animation.owner.effectId === effect.id)
        children.push({ id: animation.id, name: animation.preset.name, animationId: animation.id });
  }
  return children;
}
