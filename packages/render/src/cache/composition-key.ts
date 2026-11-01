import type { Composition, Layer } from "@musart/core";
import { isInstancedPrimitive, primitivePaintKey } from "../compositing/primitives/eligibility";
/** Root paint/placement dependencies. Editing-only page metadata does not invalidate pixels. */
export function compositionPaintKey(
  page: Composition,
  roots: readonly Layer[],
  keyFor: (layer: Layer) => unknown,
): string {
  return JSON.stringify([
    page.width,
    page.height,
    page.background,
    page.backgroundGradient,
    page.colorSpace ?? "srgb",
    roots.map((layer) => [
      layer.id,
      layer.x,
      layer.y,
      layer.rotation,
      layer.scaleX ?? 1,
      layer.scaleY ?? 1,
      layer.affine ?? null,
      layer.opacity,
      layer.visible,
      layer.blendMode,
      isInstancedPrimitive(layer) ? primitivePaintKey(layer) : keyFor(layer),
    ]),
  ]);
}
