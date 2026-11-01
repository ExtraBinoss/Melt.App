/** Keep one common vertex index set across every state. A vertex is removable only when
 * its displacement from the same affine combination of retained neighbors is within tolerance
 * in ALL states. Convex interpolation therefore keeps that same error bound between states.
 * This is preparation only; no authored state/timing is removed. Buffers contain finite XY pairs.
 */
export function* correspondingIndicesSteps(
  states: readonly Float64Array[],
  tolerance = 1e-10,
): Generator<void, Uint16Array> {
  const length = states[0]?.length ?? 0,
    n = length / 2;
  if (
    !states.length ||
    states.length > 120 ||
    n < 3 ||
    n > 4096 ||
    !Number.isInteger(n) ||
    states.some((state) => state.length !== length) ||
    !Number.isFinite(tolerance) ||
    tolerance < 0
  )
    throw new RangeError("Invalid corresponding contour states.");
  const first = Math.floor(n / 3),
    second = Math.floor((n * 2) / 3),
    kept = new Uint8Array(n),
    stack = [0, first, first, second, second, n];
  kept[0] = kept[first] = kept[second] = 1;
  while (stack.length) {
    const b = stack.pop()!,
      a = stack.pop()!;
    let error = tolerance * tolerance,
      worst = -1;
    for (let i = a + 1; i < b; i++) {
      const t = (i - a) / (b - a);
      for (const state of states) {
        const bx = state[(b % n) * 2]!,
          by = state[(b % n) * 2 + 1]!,
          ax = state[a * 2]!,
          ay = state[a * 2 + 1]!,
          dx = state[i * 2]! - (ax + (bx - ax) * t),
          dy = state[i * 2 + 1]! - (ay + (by - ay) * t),
          squared = dx * dx + dy * dy;
        if (squared > error) {
          error = squared;
          worst = i;
        }
      }
    }
    if (worst >= 0) {
      kept[worst] = 1;
      stack.push(a, worst, worst, b);
    }
    yield;
  }

  const indices: number[] = [];
  for (let i = 0; i < n; i++) if (kept[i]) indices.push(i);
  return Uint16Array.from(indices);
}
export function correspondingIndices(
  states: readonly Float64Array[],
  tolerance = 1e-10,
): Uint16Array {
  const steps = correspondingIndicesSteps(states, tolerance);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}
