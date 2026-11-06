import type { Bounds, Composition, Layer, LayerGeometryIndex } from "@musart/core";
import type { EffectAuxiliaryInputs } from "../effects/shared/context";
import type { CapturePaint } from "./capture-paint";
/** Immutable source/reference context shared by a compositor frame's layer traversal. */
export interface RenderFrame {
  readonly page: Composition;
  readonly history?: EffectAuxiliaryInputs["history"];
  readonly capture?: CapturePaint;
  readonly viewport?: Bounds;
  readonly backgroundId?: string;
  readonly scale: number;
  readonly referenceScale: number;
  readonly vectorAntialias: boolean;
  readonly keyFor: (layer: Layer) => string;
  readonly referenceKeyFor: (layer: Layer) => string;
  readonly geometry: LayerGeometryIndex;
}
