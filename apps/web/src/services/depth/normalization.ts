/** Relative near-white inverse depth. Invalid model output is a real failure. */
export function depthPixels(
  values: Float32Array,
  width: number,
  height: number,
  range?: readonly [number, number],
) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    values.length !== width * height
  )
    throw Error("Invalid depth dimensions.");
  let lo = Infinity,
    hi = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) throw Error("Invalid depth prediction.");
    lo = Math.min(lo, value);
    hi = Math.max(hi, value);
  }
  // A flat opening frame or a scene cut must not clamp the entire clip to one gray value.
  const limits =
    range && range[1] > range[0] && lo <= range[1] && hi >= range[0] ? range : ([lo, hi] as const);
  const data = new Uint8ClampedArray(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    const value =
      limits[1] === limits[0]
        ? 0.5
        : 1 - Math.min(1, Math.max(0, (values[i]! - limits[0]) / (limits[1] - limits[0])));
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(value * 255);
    data[i * 4 + 3] = 255;
  }
  return { data, range: limits };
}
