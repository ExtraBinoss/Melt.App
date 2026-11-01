/** Three r187 PMREMs use six half-float faces, down to an explicit 8px mip. */
export function pmremSize(requested: number): number {
  return Math.max(256, 2 ** Math.floor(Math.log2(requested)));
}
function mipPixels(size: number, minimum: number): number {
  let pixels = 0;
  for (let edge = size; edge >= minimum; edge /= 2) pixels += edge * edge;
  return pixels;
}
export function pmremTargetBytes(requested: number): number {
  return 6 * 8 * mipPixels(pmremSize(requested), 8);
}
/** Conservative source-cube reservation: full radiance mip chain plus depth. */
export function pmremScratchBytes(requested: number): number {
  return Math.max(32 * 1024 * 1024, 6 * 12 * mipPixels(pmremSize(requested), 1));
}
