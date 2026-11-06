import type { Composition, Layer, LayerGeometryIndex } from "@musart/core";

/** Historical owner paint keeps the original page available to native shading/depth.
 * Ancestor compositing happens later in the present graph, so capture only their transforms.
 */
export class CapturePaint {
  private readonly included = new Set<string>();
  private readonly neutral = new Set<string>();
  constructor(
    geometry: LayerGeometryIndex,
    readonly ownerId: string,
  ) {
    const owner = geometry.byId.get(ownerId);
    if (!owner) return;
    const visit = (layer: Layer) => {
      this.included.add(layer.id);
      for (const child of geometry.children(layer.id)) visit(child);
    };
    visit(owner);
    this.neutral.add(ownerId);
    let parent = owner.parentId;
    while (parent) {
      this.included.add(parent);
      this.neutral.add(parent);
      parent = geometry.byId.get(parent)?.parentId ?? null;
    }
  }
  /** Prepare only paint and mask inputs; the native scene still receives the complete page. */
  preparationPage(page: Composition, geometry: LayerGeometryIndex): Composition {
    const required = new Set(this.included);
    const visit = (id: string) => {
      if (required.has(id)) return;
      const layer = geometry.byId.get(id);
      if (!layer) return;
      required.add(id);
      for (const ancestor of geometry.ancestors(id)) required.add(ancestor.id);
      for (const child of geometry.children(id)) visit(child.id);
      if (layer.mask?.layerId) visit(layer.mask.layerId);
      if (layer.clipping?.layerId) visit(layer.clipping.layerId);
    };
    for (const id of this.included) {
      const layer = geometry.byId.get(id)!;
      if (layer.mask?.layerId) visit(layer.mask.layerId);
      if (layer.clipping?.layerId) visit(layer.clipping.layerId);
    }
    return {
      ...page,
      layers: page.layers
        .filter((layer) => required.has(layer.id))
        .map((layer) => this.layer(layer)),
    };
  }
  includes(id: string) {
    return this.included.has(id);
  }
  layer(layer: Layer): Layer {
    if (!this.neutral.has(layer.id)) return layer;
    return {
      ...layer,
      opacity: 1,
      blendMode: "normal",
      ...(layer.id !== this.ownerId ? { effects: [], mask: null, clipping: undefined } : {}),
    };
  }
}
