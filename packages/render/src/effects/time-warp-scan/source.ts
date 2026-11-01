import { createLayerGeometryIndex, type Composition, type Effect } from "@musart/core";
/** Preserve original identities/times for media and masks; isolate only the captured source graph. */
export function captureComposition(
  page: Composition,
  layerId: string,
  effectId: string,
  previewPrefix?: readonly Effect[],
): Composition {
  const geometry = createLayerGeometryIndex(page),
    included = new Set<string>(),
    expanded = new Set<string>(),
    pending = [layerId];
  const owner = geometry.get(layerId),
    at = owner.effects.findIndex((effect) => effect.id === effectId);
  if (at < 0 && !previewPrefix)
    throw new DOMException("Temporal effect is no longer present.", "AbortError");
  function ancestors(id: string) {
    for (const parent of geometry.ancestors(id)) included.add(parent.id);
  }
  while (pending.length) {
    const id = pending.pop()!;
    if (expanded.has(id)) continue;
    expanded.add(id);
    included.add(id);
    ancestors(id);
    const layer = geometry.get(id);
    for (const child of geometry.children(id)) pending.push(child.id);
    if (id !== layerId && layer.mask?.enabled && layer.mask.layerId)
      pending.push(layer.mask.layerId);
  }
  if ([...included].some((id) => geometry.get(id).spatial?.enabled))
    for (const layer of page.layers)
      if (layer.spatial?.enabled) {
        included.add(layer.id);
        ancestors(layer.id);
      }
  return {
    ...page,
    layers: page.layers
      .filter((layer) => included.has(layer.id))
      .map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              effects:
                at >= 0
                  ? layer.effects.slice(0, at)
                  : previewPrefix!.map(
                      (effect) =>
                        layer.effects.find((sampled) => sampled.id === effect.id) ?? effect,
                    ),
              mask: null,
            }
          : layer,
      ),
  };
}
