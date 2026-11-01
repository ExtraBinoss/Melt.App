import type { Composition, Layer, LayerGeometryIndex } from "@musart/core";
/** Immutable source/reference context shared by a compositor frame's layer traversal. */
export interface RenderFrame {
  readonly page: Composition;
  readonly scale: number;
  readonly referenceScale: number;
  readonly vectorAntialias: boolean;
  readonly keyFor: (layer: Layer) => string;
  readonly referenceKeyFor: (layer: Layer) => string;
  readonly geometry: LayerGeometryIndex;
}
