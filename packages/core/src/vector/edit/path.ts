import { SVGPathData } from "svg-pathdata";
import type { VectorPart } from "../model";
import type { VectorNode, VectorPoint, VectorSubpath } from "./model";
const same = (a: VectorPoint, b: VectorPoint) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-8;
/** All SVG commands, including arcs and shorthand, become absolute editable cubic segments. */
export function editVectorPath(part: Pick<VectorPart, "path" | "matrix">): VectorSubpath[] {
  const commands = new SVGPathData(part.path)
    .toAbs()
    .normalizeHVZ(false, true, true)
    .normalizeST()
    .qtToC()
    .aToC().commands;
  if (commands.length > 4096) throw new Error("VECTOR_TOO_COMPLEX");
  const paths: VectorSubpath[] = [];
  let path: VectorSubpath | undefined;
  const transform = (p: VectorPoint): VectorPoint => {
    const [a, b, c, d, e, f] = part.matrix ?? [1, 0, 0, 1, 0, 0];
    const result = { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f };
    if (
      !Number.isFinite(result.x) ||
      !Number.isFinite(result.y) ||
      Math.abs(result.x) > 1e6 ||
      Math.abs(result.y) > 1e6
    )
      throw new Error("VECTOR_INVALID_PATH");
    return result;
  };
  for (const command of commands) {
    if (command.type === SVGPathData.MOVE_TO) {
      path = { closed: false, nodes: [transform(command)] };
      paths.push(path);
    } else if (command.type === SVGPathData.CLOSE_PATH && path) {
      path.closed = true;
      const first = path.nodes[0]!,
        last = path.nodes.at(-1)!;
      if (path.nodes.length > 1 && same(first, last)) {
        if (last.incoming) first.incoming = last.incoming;
        else delete first.incoming;
        path.nodes.pop();
      }
    } else if (command.type === SVGPathData.LINE_TO && path) path.nodes.push(transform(command));
    else if (command.type === SVGPathData.CURVE_TO && path) {
      path.nodes.at(-1)!.outgoing = transform({ x: command.x1, y: command.y1 });
      path.nodes.push({
        ...transform(command),
        incoming: transform({ x: command.x2, y: command.y2 }),
      });
    } else throw new Error("VECTOR_INVALID_PATH");
  }
  if (!paths.length) throw new Error("VECTOR_INVALID_PATH");
  return paths;
}
const number = (v: number) => String(Math.round(v * 1e6) / 1e6);
const point = (p: VectorPoint) => `${number(p.x)} ${number(p.y)}`;
export function writeVectorPath(paths: readonly VectorSubpath[]): string {
  const segment = (a: VectorNode, b: VectorNode) =>
    a.outgoing || b.incoming
      ? `C${point(a.outgoing ?? a)} ${point(b.incoming ?? b)} ${point(b)}`
      : `L${point(b)}`;
  return paths
    .map((path) => {
      if (!path.nodes.length) throw new Error("VECTOR_INVALID_PATH");
      let result = `M${point(path.nodes[0]!)}`;
      for (let i = 1; i < path.nodes.length; i++)
        result += segment(path.nodes[i - 1]!, path.nodes[i]!);
      if (path.closed) {
        const last = path.nodes.at(-1)!,
          first = path.nodes[0]!;
        if (last.outgoing || first.incoming) result += segment(last, first);
        result += "Z";
      }
      return result;
    })
    .join(" ");
}
