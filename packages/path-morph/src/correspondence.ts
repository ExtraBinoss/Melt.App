export type PathPoint = readonly [number, number];
const MAX_POINTS = 4096;
/** Arc-length correspondence, prepared once. Float64 preserves authored coordinates. */
export function resampleClosed(points: readonly PathPoint[], count: number): Float64Array {
  if (
    !Number.isSafeInteger(count) ||
    count < 3 ||
    count > MAX_POINTS ||
    points.length < 1 ||
    points.length > MAX_POINTS
  )
    throw new RangeError("Invalid closed-path point budget.");
  const lengths = new Float64Array(points.length);
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!,
      q = points[(i + 1) % points.length]!;
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]))
      throw new RangeError("Path coordinates must be finite.");
    lengths[i] = Math.hypot(p[0] - q[0], p[1] - q[1]);
    perimeter += lengths[i]!;
  }
  const output = new Float64Array(count * 2);
  let edge = 0,
    passed = 0;
  for (let i = 0; i < count; i++) {
    const distance = (i / count) * perimeter;
    while (edge < points.length - 1 && passed + lengths[edge]! < distance)
      passed += lengths[edge++]!;
    const p = points[perimeter < 1e-10 ? 0 : edge]!,
      q = points[perimeter < 1e-10 ? 0 : (edge + 1) % points.length]!,
      t = perimeter < 1e-10 ? 0 : (distance - passed) / Math.max(lengths[edge]!, 1e-12);
    output[i * 2] = p[0] + (q[0] - p[0]) * t;
    output[i * 2 + 1] = p[1] + (q[1] - p[1]) * t;
  }
  return output;
}
/** Exact least-squares cyclic alignment, with admissible early rejection of losing shifts.
 * Inputs are finite prepared XY pairs; output must not overlap either input.
 * Returns the chosen cyclic shift. Equal costs retain the first shift deterministically.
 */
export function alignClosedInto(
  points: Float64Array,
  reference: Float64Array,
  output: Float64Array,
): number {
  const n = points.length;
  if (
    n < 6 ||
    n % 2 ||
    n > MAX_POINTS * 2 ||
    reference.length !== n ||
    output.length !== n ||
    output.buffer === points.buffer ||
    output.buffer === reference.buffer
  )
    throw new RangeError("Invalid or aliased path correspondence buffers.");
  let best = 0,
    score = Infinity;
  for (let shift = 0; shift < n; shift += 2) {
    let cost = 0,
      at = shift;
    for (let i = 0; i < n; i += 2) {
      const dx = points[at]! - reference[i]!,
        dy = points[at + 1]! - reference[i + 1]!;
      cost += dx * dx + dy * dy;
      if (cost >= score) break;
      at += 2;
      if (at === n) at = 0;
    }
    if (cost < score) {
      score = cost;
      best = shift;
    }
    if (score === 0) break;
  }
  const tail = n - best;
  output.set(points.subarray(best), 0);
  output.set(points.subarray(0, best), tail);
  return best / 2;
}
