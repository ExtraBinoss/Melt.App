import { backgroundLayer, type Bounds, type Composition } from "@musart/core";
import { rasterExtent } from "./types";
import type { GroupViewport } from "./group-viewport";

/** Presentation transport only: canonical sources and their world camera stay unchanged. */
export function compositionViewport(scale: number, bounds?: Bounds): GroupViewport | undefined {
  if (!bounds) return undefined;
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    throw new RangeError("Invalid composition display viewport.");
  const pixelWidth = rasterExtent(bounds.width, scale),
    pixelHeight = rasterExtent(bounds.height, scale);
  if (pixelWidth > 16384 || pixelHeight > 16384 || pixelWidth * pixelHeight > 64_000_000)
    throw new RangeError("Composition display viewport exceeds the render limits.");
  return { bounds, pixelWidth, pixelHeight, empty: false, key: JSON.stringify(bounds) };
}

export function viewportBackground(page: Composition, viewport?: Bounds): string | undefined {
  return backgroundLayer(page, Boolean(viewport))?.id;
}
