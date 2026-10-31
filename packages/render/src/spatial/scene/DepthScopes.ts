import { createLayerGeometryIndex, type Composition } from "@musart/core";

/**
 * A faded group is opaque to its own children, but contributes no opaque holdout
 * outside its isolation surface. Nested faded groups introduce another scope.
 * Material alpha remains the responsibility of DepthBindings, independently of
 * document alpha; masks/effects remain post-composite treatments.
 */
export class DepthScopes {
  private readonly scopes = new Map<string, string>();
  private readonly blockers = new Map<string, ReadonlySet<string>>();
  constructor(
    page: Composition,
    sourceIds: Iterable<string> = page.layers
      .filter((layer) => layer.spatial?.enabled && layer.spatial.source !== "group")
      .map((layer) => layer.id),
  ) {
    const index = createLayerGeometryIndex(page);
    const layers = [...sourceIds].map((id) => index.get(id));
    const fadedAncestors = new Map<string, string[]>();
    const scopeAncestors = new Map<string, ReadonlySet<string>>([["", new Set()]]);
    for (const layer of layers) {
      const faded = index.ancestors(layer.id).filter((parent) => parent.opacity < 1);
      const ids = faded.map((parent) => parent.id);
      const scope = ids.at(-1) ?? "";
      fadedAncestors.set(layer.id, ids);
      this.scopes.set(layer.id, scope);
      scopeAncestors.set(scope, new Set(ids));
    }
    for (const [scope, shared] of scopeAncestors) {
      const blockers = new Set<string>();
      for (const layer of layers)
        if (
          layer.opacity === 1 &&
          index.isVisible(layer.id) &&
          !index.isMaskSource(layer.id) &&
          fadedAncestors.get(layer.id)!.every((ancestor) => shared.has(ancestor))
        )
          blockers.add(layer.id);
      this.blockers.set(scope, blockers);
    }
  }
  /** Empty string identifies the composition's ordinary opaque depth. */
  scope(id: string): string {
    return this.scopes.get(id) ?? "";
  }
  writes(sourceId: string, scope: string): boolean {
    return this.blockers.get(scope)?.has(sourceId) ?? false;
  }
}
