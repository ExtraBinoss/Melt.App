import type { Composition, Effect } from "../../document/model";
import { resolveEffectSettings } from "../settings";

export type TrailMode = "temporal" | "offset";

/** Resolve the source's authored history, independently of the current sample's available past.
 * In particular an animated owner at time zero remains temporal with zero prior samples.
 */
export function trailMode(effect: Effect, page: Composition, ownerId?: string): TrailMode {
  const mode = resolveEffectSettings(effect).mode;
  if (mode === "temporal" || mode === "offset") return mode;
  const byId = new Map(page.layers.map((layer) => [layer.id, layer]));
  const subtree = new Set<string>();
  const related = new Set<string>();
  for (const layer of page.layers) {
    let ancestor = layer;
    while (true) {
      if (!ownerId || ancestor.id === ownerId) {
        subtree.add(layer.id);
        related.add(layer.id);
        break;
      }
      const parent = ancestor.parentId && byId.get(ancestor.parentId);
      if (!parent) break;
      ancestor = parent;
    }
  }
  let ancestor = ownerId && byId.get(ownerId);
  while (ancestor) {
    related.add(ancestor.id);
    ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
  }
  if (page.layers.some((layer) => subtree.has(layer.id) && layer.kind === "video"))
    return "temporal";
  const motion = page.motion;
  if (motion?.mode !== "motion") return "offset";
  if (
    motion.tracks.some(
      (track) =>
        related.has(track.layerId) &&
        (track.properties.some((property) => property.keyframes.length > 1) ||
          track.animations?.some(
            (animation) =>
              animation.enabled &&
              animation.strength !== 0 &&
              animation.preset.channels.some((channel) => channel.points.length > 1),
          )),
    )
  )
    return "temporal";
  // Camera and lighting channels alter native object pixels even without a layer channel.
  const native = page.layers.some((layer) => subtree.has(layer.id) && layer.spatial?.enabled);
  if (
    (!ownerId || native) &&
    (motion.sceneProperties?.some((property) => property.keyframes.length > 1) ||
      motion.sceneAnimations?.some(
        (animation) =>
          animation.enabled &&
          animation.strength !== 0 &&
          animation.preset.channels.some((channel) => channel.points.length > 1),
      ))
  )
    return "temporal";
  return "offset";
}

/** Render-only settings; never write automatic choices into portable documents or Motion keys. */
export function resolveTrailMode(effect: Effect, page: Composition, ownerId?: string): Effect {
  if (effect.type !== "trail" || resolveEffectSettings(effect).mode !== "auto") return effect;
  const mode = trailMode(effect, page, ownerId);
  const automaticOffset =
    mode === "offset" &&
    !Object.hasOwn(effect.settings ?? {}, "offsetX") &&
    !Object.hasOwn(effect.settings ?? {}, "offsetY");
  return {
    ...effect,
    settings: { ...effect.settings, ...(automaticOffset ? { offsetX: 16 } : {}), mode },
  };
}
