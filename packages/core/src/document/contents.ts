import type { EffectType, LayerKind, Project } from "./model.ts";

export type ProjectContentTag =
  | `layer:${LayerKind}`
  | `effect:${EffectType}`
  | "feature:3d"
  | "feature:motion"
  | "feature:audio"
  | "feature:masks"
  | "feature:gradients"
  | "feature:morph"
  | "feature:blank";

/** A bounded inventory of authored content. No originals, history, renderer or template IDs. */
export function projectContentTags(project: Pick<Project, "pages">): readonly ProjectContentTag[] {
  const tags = new Set<ProjectContentTag>();
  for (const page of project.pages) {
    if (page.motion?.mode === "motion") tags.add("feature:motion");
    if (page.motion?.audioTracks?.length) tags.add("feature:audio");
    if (page.backgroundGradient) tags.add("feature:gradients");
    for (const layer of page.layers) {
      tags.add(`layer:${layer.kind}`);
      if (layer.spatial?.enabled) tags.add("feature:3d");
      if (layer.mask || layer.maskSource) tags.add("feature:masks");
      if (layer.fillGradient) tags.add("feature:gradients");
      for (const effect of layer.effects) {
        tags.add(`effect:${effect.type}`);
        if (effect.shapeMorph) tags.add("feature:morph");
      }
    }
  }
  if (!tags.size) tags.add("feature:blank");
  return Object.freeze([...tags].sort());
}
