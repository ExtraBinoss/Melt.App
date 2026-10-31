import type { Composition, Layer } from "@musart/core";
import type { CompositionPerformanceMetric } from "../../state/session/composition-performance";

/** Linear, iterative ancestry evaluation: deep groups cannot overflow the call stack. */
function visibleLayers(layers: readonly Layer[]): number {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  if (byId.size !== layers.length)
    throw new Error("Duplicate layer identity in performance inventory");
  const visible = new Map<string, boolean>();
  let count = 0;
  for (const layer of layers) {
    const path: Layer[] = [],
      visiting = new Set<string>();
    let current: Layer | undefined = layer;
    while (current && !visible.has(current.id)) {
      if (visiting.has(current.id))
        throw new Error("Cyclic layer hierarchy in performance inventory");
      visiting.add(current.id);
      path.push(current);
      if (current.parentId === null) break;
      const parent = byId.get(current.parentId);
      if (!parent) throw new Error("Missing layer parent in performance inventory");
      current = parent;
    }
    let inherited = current ? (visible.get(current.id) ?? true) : true;
    for (let i = path.length - 1; i >= 0; i--) {
      const entry = path[i]!;
      inherited = inherited && entry.visible && entry.opacity > 0 && !entry.maskSource;
      visible.set(entry.id, inherited);
    }
    if (visible.get(layer.id)) count++;
  }
  return count;
}

/** Document inventory only; counts are never estimates of rendering time or audible output. */
export function compositionInventory(page: Composition): CompositionPerformanceMetric[] {
  const counts = {
    images: 0,
    videos: 0,
    shapes: 0,
    textLayers: 0,
    groups: 0,
    effects: 0,
    masks: 0,
  };
  const kindMetrics = {
    image: "images",
    video: "videos",
    rectangle: "shapes",
    ellipse: "shapes",
    vector: "shapes",
    text: "textLayers",
    group: "groups",
  } as const;
  for (const layer of page.layers) {
    counts[kindMetrics[layer.kind]]++;
    for (const effect of layer.effects) if (effect.enabled) counts.effects++;
    if (layer.mask?.enabled) counts.masks++;
  }
  const tracks = page.motion?.tracks ?? [];
  let channels = 0;
  for (const track of tracks) {
    channels += track.properties.length;
    for (const animation of track.animations ?? [])
      if (animation.enabled) channels += animation.preset.channels.length;
  }
  const metric = (id: string, domain: string, value: number): CompositionPerformanceMetric => ({
    id,
    domain,
    value,
    availability: "measured",
    kind: "inventory",
    unit: "count",
  });
  return [
    metric("layers", "scene", page.layers.length),
    metric("visibleLayers", "scene", visibleLayers(page.layers)),
    metric("groups", "scene", counts.groups),
    metric("effects", "scene", counts.effects),
    metric("masks", "scene", counts.masks),
    metric("images", "images", counts.images),
    metric("videos", "videos", counts.videos),
    metric("shapes", "shapes", counts.shapes),
    metric("textLayers", "text", counts.textLayers),
    metric("animationTracks", "animation", tracks.length),
    metric("animationChannels", "animation", channels),
    metric("audioTracks", "audio", page.motion?.audioTracks?.length ?? 0),
  ];
}
