import type { Bounds } from "@musart/core";
import { rasterExtent } from "./types";

/** Keep the logical rectangle intact while bounding its GPU sampling lattice. */
export function projectedRaster(
  bounds: Pick<Bounds, "width" | "height">,
  requested: number,
  maxDimension: number,
  maxPixels: number,
) {
  if (!(maxDimension >= 1) || !(maxPixels >= 1))
    throw new RangeError("Invalid projected raster budget.");
  let scale = Math.min(
    requested,
    maxDimension / bounds.width,
    maxDimension / bounds.height,
    Math.sqrt(maxPixels / (bounds.width * bounds.height)),
  );
  let width = rasterExtent(bounds.width, scale),
    height = rasterExtent(bounds.height, scale);
  // Integer raster edges are part of the admission calculation, including very thin planes.
  while (width > maxDimension || height > maxDimension || width * height > maxPixels) {
    scale *=
      Math.min(
        maxDimension / width,
        maxDimension / height,
        Math.sqrt(maxPixels / (width * height)),
      ) *
      (1 - 1e-6);
    width = rasterExtent(bounds.width, scale);
    height = rasterExtent(bounds.height, scale);
  }
  return { width, height, scale };
}
