import type { Project } from "./model";

let sequence = 0;
const reserved = new Set<string>();

/** A session-local allocator; imported IDs are reserved before further creation. */
export function createId(prefix = "node"): string {
  let id: string;
  do {
    sequence += 1;
    id = `${prefix}-${sequence.toString(36)}`;
  } while (reserved.has(id));
  reserved.add(id);
  return id;
}

/** Collect only durable schema identities, including scene channels and spatial lights. */
export function collectProjectIds(project: Project): Set<string> {
  const ids = new Set<string>([project.id]);
  for (const asset of Object.values(project.assets)) ids.add(asset.id);
  for (const page of project.pages) {
    ids.add(page.id);
    for (const effect of page.effects ?? []) ids.add(effect.id);
    for (const light of page.spatial?.lights ?? []) ids.add(light.id);
    for (const track of page.motion?.audioTracks ?? []) ids.add(track.id);
    for (const animation of page.motion?.sceneAnimations ?? []) ids.add(animation.id);
    for (const property of page.motion?.sceneProperties ?? []) {
      ids.add(property.id);
      for (const key of property.keyframes) ids.add(key.id);
    }
    for (const track of page.motion?.tracks ?? []) {
      ids.add(track.id);
      for (const animation of track.animations ?? []) ids.add(animation.id);
      for (const property of track.properties) {
        ids.add(property.id);
        for (const key of property.keyframes) ids.add(key.id);
      }
    }
    for (const guide of page.guides) ids.add(guide.id);
    for (const layer of page.layers) {
      ids.add(layer.id);
      for (const effect of layer.effects) ids.add(effect.id);
      for (const guide of layer.guides ?? []) ids.add(guide.id);
    }
  }
  return ids;
}
/** Reserve the complete validated graph, optionally reusing the engine's identity index. */
export function reserveProjectIds(
  project: Project,
  ids: ReadonlySet<string> = collectProjectIds(project),
): void {
  for (const id of ids) reserved.add(id);
}
