import ClipperLib from "clipper-lib";
import { Path, Shape, Vector2, type ShapePath } from "three";

const PRECISION = 1_000_000;
const MAX_POINTS = 60_000;
/** Resolve the actual fill before Three triangulates/extrudes. Variable font outlines
 * and imported SVGs may overlap themselves; Earcut requires simple boundaries. */
export function filledContourShapes(
  path: ShapePath,
  curveSegments: number,
  fillRule: "nonzero" | "evenodd" = "nonzero",
): Shape[] {
  let count = 0;
  const paths = path.subPaths
    .map((subpath) => {
      const points = subpath.getPoints(curveSegments);
      count += points.length;
      if (count > MAX_POINTS) throw new RangeError("3D contour exceeds the point budget");
      return points.map(({ x, y }) => {
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          Math.abs(x) > 1_000_000 ||
          Math.abs(y) > 1_000_000
        )
          throw new RangeError("3D contour exceeds the coordinate budget");
        return { X: Math.round(x * PRECISION), Y: Math.round(y * PRECISION) };
      });
    })
    .filter((points) => points.length >= 3);
  if (!paths.length) return [];
  const clipper = new ClipperLib.Clipper(),
    tree = new ClipperLib.PolyTree();
  clipper.StrictlySimple = true;
  const rule =
    fillRule === "evenodd"
      ? ClipperLib.PolyFillType.pftEvenOdd
      : ClipperLib.PolyFillType.pftNonZero;
  try {
    clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
    if (!clipper.Execute(ClipperLib.ClipType.ctUnion, tree, rule, rule))
      throw Error("Unable to resolve 3D filled contours");
    const output: Shape[] = [],
      pending = [...tree.Childs()];
    const points = (node: ClipperLib.PolyNode) =>
      node.Contour().map((point) => new Vector2(point.X / PRECISION, point.Y / PRECISION));
    while (pending.length) {
      const node = pending.pop()!;
      pending.push(...node.Childs());
      if (node.IsHole() || node.Contour().length < 3) continue;
      const shape = new Shape(points(node));
      shape.closePath();
      for (const child of node.Childs())
        if (child.IsHole() && child.Contour().length >= 3) {
          const hole = new Path(points(child));
          hole.closePath();
          shape.holes.push(hole);
        }
      output.push(shape);
    }
    return output;
  } finally {
    clipper.Clear();
    tree.Clear();
  }
}
