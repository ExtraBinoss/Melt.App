import { alignClosedInto, resampleClosed, type PathPoint } from "./correspondence";
type Buffer = Float32Array | Float64Array | number[];
/** No allocation, serialization, correspondence search or geometry reads during playback.
 * Both endpoint arrays must contain finite prepared values. Aliasing an endpoint is supported.
 */
export function interpolateInto(
  from: ArrayLike<number>,
  to: ArrayLike<number>,
  t: number,
  out: Buffer,
): void {
  if (from.length !== to.length || out.length !== from.length || !Number.isFinite(t))
    throw new RangeError("Invalid interpolation buffers or progress.");
  for (let i = 0; i < out.length; i++) out[i] = from[i]! + (to[i]! - from[i]!) * t;
}
/** Explicit closed polygon API. Parsing SVG curves and matching holes belong to the caller.
 * The prepared arrays also feed a GPU atlas directly; CPU consumers supply their own output.
 */
export function compilePathPair(
  from: readonly PathPoint[],
  to: readonly PathPoint[],
  samples = 256,
) {
  const start = resampleClosed(from, samples),
    sampled = resampleClosed(to, samples),
    end = new Float64Array(sampled.length);
  alignClosedInto(sampled, start, end);
  return {
    from: start,
    to: end,
    points: samples,
    interpolate(t: number, output: Buffer): void {
      interpolateInto(start, end, t, output);
    },
  };
}
