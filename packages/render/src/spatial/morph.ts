import { prepareMorphShape, type MorphShapeFrame, type ShapeMorph } from "@musart/core";
import type { PathCommand, SpatialGeometryJob } from "./geometry-model";
const prepared = new Map<string, ShapeMorph>();
/** Worker-local bounded topology preparation; advancing progress only samples aligned contours. */
export function spatialMorphPaths(job: SpatialGeometryJob): PathCommand[][] | null {
  const morph = job.morph;
  if (!morph) return null;
  let definition = prepared.get(morph.key);
  if (!definition) {
    if (!morph.definition) throw Error("3D morph topology is unavailable");
    const estimate = morph.definition.shapes.reduce(
      (n, shape) =>
        n +
        shape.frames.length *
          shape.frames[0]!.contours.reduce((m, c) => m + (c.hole ? 64 : 256), 0),
      0,
    );
    if (estimate > 262144) throw Error("3D morph exceeds the point budget");
    definition = {
      ...morph.definition,
      shapes: morph.definition.shapes.map((shape) => ({ frames: prepareMorphShape(shape.frames) })),
    };
    prepared.set(morph.key, definition);
  }
  prepared.delete(morph.key);
  prepared.set(morph.key, definition);
  if (prepared.size > 8) prepared.delete(prepared.keys().next().value!);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const paths: PathCommand[][] = [];
  const scale = 2 / Math.min(morph.width, morph.height);
  definition.shapes.forEach((shape, index) => {
    const rank = definition.shapes.length > 1 ? index / (definition.shapes.length - 1) : 0;
    const order =
      morph.order === "reverse"
        ? 1 - rank
        : morph.order === "center"
          ? Math.abs(rank - 0.5) * 2
          : rank;
    const time = Math.max(
      0,
      Math.min(1, (morph.progress - order * morph.stagger) / (1 - morph.stagger)),
    );
    const initial = shape.frames[0]!;
    let a: MorphShapeFrame = initial,
      b = initial,
      t = 0;
    for (let i = 1; i < shape.frames.length; i++) {
      const left = shape.frames[i - 1]!,
        right = shape.frames[i]!;
      if (time < left.at) break;
      a = left;
      b = right;
      const u = Math.max(0, Math.min(1, (time - a.at) / Math.max(1e-6, b.at - a.at)));
      t =
        b.easing === "easeOut"
          ? 1 - (1 - u) ** 3
          : b.easing === "easeInOut"
            ? u * u * (3 - 2 * u)
            : u;
    }
    const box = initial.box.map((v, at) => mix(v, mix(a.box[at]!, b.box[at]!, t), morph.amount));
    const commands: PathCommand[] = [];
    initial.contours.forEach((contour, ci) => {
      const points = contour.points.map((point, pi) => {
        const one = a.contours[ci]!.points[pi]!,
          two = b.contours[ci]!.points[pi]!;
        const x = mix(point[0], mix(one[0], two[0], t), morph.amount);
        const y = mix(point[1], mix(one[1], two[1], t), morph.amount);
        return {
          x: ((box[0]! + x * box[2]!) * morph.width - morph.width / 2) * scale,
          y: (morph.height / 2 - (box[1]! + y * box[3]!) * morph.height) * scale,
        };
      });
      const area = points.reduce((sum, p, index) => {
        const q = points[(index + 1) % points.length]!;
        return sum + p.x * q.y - q.x * p.y;
      }, 0);
      if (area < 0 === contour.hole) points.reverse();
      points.forEach((point, index) => commands.push({ type: index ? "L" : "M", ...point }));
      commands.push({ type: "Z" });
    });
    paths.push(commands);
  });
  return paths;
}
