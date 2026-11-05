import type { Bounds } from "../layers/geometry";

/** A fixed output format inside an optional visible camera window; no document reflow. */
export interface OutputFraming {
  width: number;
  height: number;
  region?: Bounds;
}

export function fitOutputRegion(bounds: Bounds, width: number, height: number): Bounds {
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height, width, height].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    width <= 0 ||
    height <= 0
  )
    throw new RangeError("Invalid capture bounds or output dimensions.");
  const ratio = width / height;
  const w = Math.min(bounds.width, bounds.height * ratio);
  const h = w / ratio;
  return {
    x: bounds.x + (bounds.width - w) / 2,
    y: bounds.y + (bounds.height - h) / 2,
    width: w,
    height: h,
  };
}

/** Resolve the original scene's sampling density and a final native GPU texture crop. */
export function resolveOutputFraming(
  page: { width: number; height: number },
  framing?: OutputFraming,
  scale = 1,
) {
  if (
    ![page.width, page.height, scale].every(Number.isFinite) ||
    page.width <= 0 ||
    page.height <= 0 ||
    scale <= 0 ||
    scale > 8
  )
    throw new RangeError("Invalid output scale or composition dimensions.");
  const source = { x: 0, y: 0, width: page.width, height: page.height };
  const window = framing?.region ?? source;
  if (
    ![window.x, window.y, window.width, window.height].every(Number.isFinite) ||
    window.x < -1e-7 ||
    window.y < -1e-7 ||
    window.width <= 0 ||
    window.height <= 0 ||
    window.x + window.width > page.width + 1e-7 ||
    window.y + window.height > page.height + 1e-7
  )
    throw new RangeError("The capture window is outside the composition.");
  if (
    framing &&
    ![framing.width, framing.height].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 16384,
    )
  )
    throw new RangeError("Output dimensions must be integers between 1 and 16384.");
  const raster = (extent: number) => {
    const value = extent * scale;
    return Math.max(1, Math.ceil(value - Math.max(1, Math.abs(value)) * Number.EPSILON * 4));
  };
  const width = framing ? Math.max(1, Math.round(framing.width * scale)) : raster(page.width);
  const height = framing ? Math.max(1, Math.round(framing.height * scale)) : raster(page.height);
  if (width > 16384 || height > 16384 || width * height > 64_000_000)
    throw new RangeError("Output exceeds 16384 pixels per edge or 64 megapixels.");
  const region = framing ? fitOutputRegion(window, framing.width, framing.height) : source;
  return { region, width, height, scale: framing ? width / region.width : scale };
}
