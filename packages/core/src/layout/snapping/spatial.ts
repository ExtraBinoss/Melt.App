import { SnapAxisIndex, compareSnapMatches } from "./axis-index";
import type { AxisMatch, SnapKind, SnapTarget } from "./model";

export type SnapVector = readonly [number, number, number];
export type SnapAxis = 0 | 1 | 2;
export interface SnapBounds3 {
  id: string;
  min: SnapVector;
  max: SnapVector;
  kind?: SnapKind;
}
export interface SpatialSnapCue {
  axis: SnapAxis;
  targetId: string;
  kind: SnapKind;
  from: SnapVector;
  to: SnapVector;
}
export interface SnapProjection {
  x: number;
  y: number;
  visible: boolean;
}
export type SnapProjector = (point: SnapVector) => SnapProjection;
interface Lock {
  match: AxisMatch;
  anchor: number;
}
const axes = [0, 1, 2] as const;
const center = (b: SnapBounds3): [number, number, number] =>
  axes.map((axis) => (b.min[axis] + b.max[axis]) / 2) as [number, number, number];
const distance = (a: SnapProjection, b: SnapProjection) => Math.hypot(a.x - b.x, a.y - b.y);

/** Camera-independent indexed constraints for either a plane or space. Capture once per gesture.
 * Adapters supply screen projection, not GPU resources. The same sorted axis indices power 2D.
 */
export class SpatialSnapIndex {
  private readonly indices: SnapAxisIndex[];
  private readonly points = new Map<SnapTarget, SnapVector>();
  private readonly locks = new Map<SnapAxis, Lock>();
  constructor(
    readonly moving: SnapBounds3,
    references: readonly SnapBounds3[],
  ) {
    for (const bounds of [moving, ...references])
      if (
        axes.some(
          (a) =>
            !Number.isFinite(bounds.min[a]) ||
            !Number.isFinite(bounds.max[a]) ||
            bounds.min[a] > bounds.max[a],
        )
      )
        throw new RangeError("Invalid spatial snapping bounds");
    this.indices = axes.map((axis) => {
      const cross = (axis + 1) % 3;
      const targets: SnapTarget[] = [];
      for (const bounds of references) {
        if (bounds.id === moving.id) continue;
        const middle = center(bounds);
        for (const value of new Set([bounds.min[axis], middle[axis], bounds.max[axis]])) {
          const target: SnapTarget = {
            axis: "x",
            value,
            min: bounds.min[cross]!,
            max: bounds.max[cross]!,
            id: bounds.id,
            kind: bounds.kind ?? "layer",
          };
          const point = [...middle] as [number, number, number];
          point[axis] = value;
          this.points.set(target, point);
          targets.push(target);
        }
      }
      return new SnapAxisIndex(targets);
    });
  }
  clear() {
    this.locks.clear();
  }
  snap(
    offset: SnapVector,
    allowed: readonly SnapAxis[],
    project: SnapProjector,
    threshold: number,
    enabled = true,
    planeNormal?: SnapVector,
  ) {
    if (!offset.every(Number.isFinite) || !Number.isFinite(threshold) || threshold < 0)
      throw new RangeError("Invalid spatial snapping query");
    if (planeNormal && (!planeNormal.every(Number.isFinite) || Math.hypot(...planeNormal) < 1e-8))
      throw new RangeError("Invalid snapping plane");
    // A camera-facing free handle has two degrees of freedom. Solve its dominant
    // coordinate from the plane equation instead of changing depth independently.
    const drop = planeNormal
      ? axes.reduce<SnapAxis>(
          (best, axis) => (Math.abs(planeNormal[axis]) > Math.abs(planeNormal[best]) ? axis : best),
          0,
        )
      : null;
    const correction: [number, number, number] = [0, 0, 0];
    const cues: SpatialSnapCue[] = [];
    let checks = 0;
    if (!enabled) {
      this.clear();
      return { correction, cues, checks };
    }
    const middle = center(this.moving);
    const locks = new Map<SnapAxis, Lock>();
    for (const axis of axes) {
      if (!allowed.includes(axis) || axis === drop) continue;
      const cross = (axis + 1) % 3;
      const measure = (anchor: number, target: SnapTarget, tolerance: number) => {
        if (!project(this.points.get(target)!).visible) return false;
        const from = middle.map((v, a) => v + offset[a]!) as [number, number, number];
        from[axis] = anchor + offset[axis];
        const to = [...from] as [number, number, number];
        to[axis] = target.value;
        if (planeNormal && drop !== null)
          to[drop] -= (planeNormal[axis] * (to[axis] - from[axis])) / planeNormal[drop] || 0;
        const a = project(from),
          b = project(to);
        // A view-parallel axis must not attract arbitrarily distant depths at zero screen cost.
        const probe = [...from] as [number, number, number];
        probe[axis] += 0.001;
        if (planeNormal && drop !== null)
          probe[drop] -= (planeNormal[axis] * 0.001) / planeNormal[drop] || 0;
        const p = project(probe);
        return (
          a.visible &&
          b.visible &&
          p.visible &&
          distance(a, p) > 1e-6 &&
          distance(a, b) <= tolerance * (1 + 2 ** -23)
        );
      };
      let chosen: Lock | undefined;
      const held = this.locks.get(axis);
      if (held && measure(held.anchor, held.match.target, threshold * 1.6)) chosen = held;
      if (!chosen) {
        for (const anchor of new Set([
          this.moving.min[axis],
          middle[axis],
          this.moving.max[axis],
        ])) {
          const found = this.indices[axis]!.nearest(
            anchor + offset[axis],
            middle[cross]! + offset[cross]!,
            Infinity,
          );
          checks += found.checks;
          if (
            found.match &&
            measure(anchor, found.match.target, threshold) &&
            (!chosen ||
              compareSnapMatches(found.match, chosen.match, middle[cross]! + offset[cross]!) < 0)
          )
            chosen = { match: found.match, anchor };
        }
      }
      if (chosen) {
        correction[axis] = chosen.match.target.value - chosen.anchor - offset[axis];
        locks.set(axis, chosen);
      }
    }
    if (planeNormal && drop !== null)
      correction[drop] =
        -axes.reduce<number>(
          (sum, axis) => (axis === drop ? sum : sum + planeNormal[axis] * correction[axis]),
          0,
        ) / planeNormal[drop] || 0;
    this.locks.clear();
    for (const [axis, lock] of locks) {
      this.locks.set(axis, lock);
      const from = middle.map((v, a) => v + offset[a]! + correction[a]!) as [
        number,
        number,
        number,
      ];
      from[axis] = lock.match.target.value;
      cues.push({
        axis,
        targetId: lock.match.target.id,
        kind: lock.match.target.kind,
        from,
        to: this.points.get(lock.match.target)!,
      });
    }
    return { correction, cues, checks };
  }
}
