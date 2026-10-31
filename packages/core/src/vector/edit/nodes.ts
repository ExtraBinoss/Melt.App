import type { VectorNode, VectorPoint, VectorSubpath, VectorNodeMode } from "./model";
const mix = (a: VectorPoint, b: VectorPoint, t: number): VectorPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export function moveVectorNode(node: VectorNode, point: VectorPoint): void {
  const dx = point.x - node.x,
    dy = point.y - node.y;
  for (const key of ["incoming", "outgoing"] as const)
    if (node[key]) node[key] = { x: node[key].x + dx, y: node[key].y + dy };
  node.x = point.x;
  node.y = point.y;
}
export function vectorNodeMode(node: VectorNode): VectorNodeMode {
  const a = node.incoming,
    b = node.outgoing;
  if (!a || !b) return a || b ? "smooth" : "corner";
  const x = a.x - node.x,
    y = a.y - node.y,
    u = b.x - node.x,
    v = b.y - node.y;
  const cross = Math.abs(x * v - y * u),
    length = Math.hypot(x, y) * Math.hypot(u, v);
  if (length < 1e-8 || cross / length > 1e-5 || x * u + y * v > 0) return "corner";
  return Math.abs(Math.hypot(x, y) - Math.hypot(u, v)) < 1e-5 ? "symmetric" : "smooth";
}
export function setVectorNodeMode(path: VectorSubpath, index: number, mode: VectorNodeMode): void {
  const node = path.nodes[index]!;
  if (mode === "corner") {
    delete node.incoming;
    delete node.outgoing;
    return;
  }
  const prev =
      !path.closed && index === 0
        ? node
        : path.nodes[(index - 1 + path.nodes.length) % path.nodes.length]!,
    next =
      !path.closed && index === path.nodes.length - 1
        ? node
        : path.nodes[(index + 1) % path.nodes.length]!;
  const length = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
  const dx = (next.x - prev.x) / length,
    dy = (next.y - prev.y) / length;
  const left = Math.hypot(prev.x - node.x, prev.y - node.y) / 3,
    right = Math.hypot(next.x - node.x, next.y - node.y) / 3;
  const a = mode === "symmetric" ? Math.min(left || right, right || left) : left,
    b = mode === "symmetric" ? a : right;
  node.incoming = { x: node.x - dx * a, y: node.y - dy * a };
  node.outgoing = { x: node.x + dx * b, y: node.y + dy * b };
  if (!path.closed && index === 0) delete node.incoming;
  if (!path.closed && index === path.nodes.length - 1) delete node.outgoing;
}
export function moveVectorHandle(
  node: VectorNode,
  key: "incoming" | "outgoing",
  point: VectorPoint,
  mode: VectorNodeMode,
): void {
  const opposite = key === "incoming" ? "outgoing" : "incoming",
    old = node[opposite];
  node[key] = point;
  if (mode === "corner" || !old) return;
  const x = point.x - node.x,
    y = point.y - node.y,
    length = Math.hypot(x, y);
  if (length < 1e-8) return;
  const ratio = mode === "symmetric" ? 1 : Math.hypot(old.x - node.x, old.y - node.y) / length;
  node[opposite] = { x: node.x - x * ratio, y: node.y - y * ratio };
}
/** de Casteljau subdivision preserves the exact original curve. */
export function splitVectorSegment(path: VectorSubpath, index: number, t = 0.5): number {
  if (
    index < 0 ||
    index >= path.nodes.length ||
    (!path.closed && index === path.nodes.length - 1) ||
    t <= 0 ||
    t >= 1
  )
    throw new Error("VECTOR_INVALID_SEGMENT");
  const a = path.nodes[index]!,
    b = path.nodes[(index + 1) % path.nodes.length]!;
  const p = mix(a, a.outgoing ?? a, t),
    q = mix(a.outgoing ?? a, b.incoming ?? b, t),
    r = mix(b.incoming ?? b, b, t),
    s = mix(p, q, t),
    u = mix(q, r, t),
    v = mix(s, u, t);
  const curved = !!a.outgoing || !!b.incoming;
  if (curved) {
    a.outgoing = p;
    b.incoming = r;
  }
  path.nodes.splice(index + 1, 0, curved ? { ...v, incoming: s, outgoing: u } : mix(a, b, t));
  return index + 1;
}
export function removeVectorNode(path: VectorSubpath, index: number): void {
  if (path.nodes.length <= (path.closed ? 3 : 2)) throw new Error("VECTOR_MINIMUM_NODES");
  path.nodes.splice(index, 1);
}
export function canRoundVectorNode(path: VectorSubpath, index: number): boolean {
  if (!path.closed && (index === 0 || index === path.nodes.length - 1)) return false;
  const a = path.nodes[(index - 1 + path.nodes.length) % path.nodes.length]!,
    b = path.nodes[index]!,
    c = path.nodes[(index + 1) % path.nodes.length]!;
  return !a.outgoing && !b.incoming && !b.outgoing && !c.incoming;
}
/** A bounded circular corner with tangent cubic handles; neighboring edges never overlap. */
export function roundVectorNode(path: VectorSubpath, index: number, radius: number): void {
  if (!Number.isFinite(radius) || radius <= 0 || !canRoundVectorNode(path, index)) return;
  const a = path.nodes[(index - 1 + path.nodes.length) % path.nodes.length]!,
    b = path.nodes[index]!,
    c = path.nodes[(index + 1) % path.nodes.length]!;
  const left = Math.hypot(a.x - b.x, a.y - b.y),
    right = Math.hypot(c.x - b.x, c.y - b.y);
  if (Math.min(left, right) < 1e-8) return;
  const u = { x: (a.x - b.x) / left, y: (a.y - b.y) / left },
    v = { x: (c.x - b.x) / right, y: (c.y - b.y) / right };
  const theta = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)));
  if (theta < 1e-5 || Math.PI - theta < 1e-5) return;
  const distance = Math.min(radius / Math.tan(theta / 2), left / 2, right / 2),
    actual = distance * Math.tan(theta / 2),
    handle = (4 / 3) * Math.tan((Math.PI - theta) / 4) * actual;
  const entry = { x: b.x + u.x * distance, y: b.y + u.y * distance },
    exit = { x: b.x + v.x * distance, y: b.y + v.y * distance };
  path.nodes.splice(
    index,
    1,
    { ...entry, outgoing: { x: entry.x - u.x * handle, y: entry.y - u.y * handle } },
    { ...exit, incoming: { x: exit.x - v.x * handle, y: exit.y - v.y * handle } },
  );
}
