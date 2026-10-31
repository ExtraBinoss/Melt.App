import { transformPoint, type Matrix, type Point } from "@musart/core";
import type { VectorDraft } from "./draft";

/** Overview density affects decoration only; every source point remains keyboard reachable. */
export function visibleVectorAnchors(points: readonly Point[], selected: number, spacing = 10) {
  const visible = new Set<number>(),
    cells = new Map<string, Point[]>();
  const cell = (p: Point) => [Math.floor(p.x / spacing), Math.floor(p.y / spacing)] as const;
  function add(index: number) {
    const p = points[index]!;
    visible.add(index);
    const key = cell(p).join(":"),
      list = cells.get(key) ?? [];
    list.push(p);
    cells.set(key, list);
  }
  if (points[selected]) add(selected);
  points.forEach((p, index) => {
    if (index === selected) return;
    const [x, y] = cell(p);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        if (
          cells
            .get(`${x + dx}:${y + dy}`)
            ?.some((other) => Math.hypot(p.x - other.x, p.y - other.y) < spacing)
        )
          return;
    add(index);
  });
  return visible;
}
function set(node: Element, key: string, value: string | number) {
  const text = String(value);
  if (node.getAttribute(key) !== text) node.setAttribute(key, text);
}
/** No layout reads: pointer frames patch only the changed SVG geometry and local styles. */
export function paintVector(root: SVGSVGElement, model: VectorDraft, matrix: Matrix, nodes = true) {
  const d = model.outline();
  for (const path of root.querySelectorAll(".vector-edit-outline")) set(path, "d", d);
  if (!nodes) return;
  const anchors: SVGCircleElement[] = [],
    points: Point[] = [];
  for (const circle of root.querySelectorAll<SVGCircleElement>("circle[data-node]")) {
    const item = model.paths[Number(circle.dataset.contour)]?.nodes[Number(circle.dataset.node)];
    if (!item) continue;
    const p = circle.dataset.handle ? item[circle.dataset.handle as "incoming" | "outgoing"] : item;
    if (!p) continue;
    const target = transformPoint(matrix, p);
    set(circle, "cx", target.x);
    set(circle, "cy", target.y);
    if (circle.classList.contains("vector-anchor")) {
      anchors.push(circle);
      points.push(target);
    }
  }
  const selected = anchors.findIndex((node) => node.dataset.selected === "true"),
    visible = visibleVectorAnchors(points, selected);
  anchors.forEach((circle, index) => {
    const opacity = visible.has(index) ? "1" : "0",
      pointer = visible.has(index) ? "auto" : "none";
    if (circle.style.opacity !== opacity) circle.style.opacity = opacity;
    if (circle.style.pointerEvents !== pointer) circle.style.pointerEvents = pointer;
  });
  for (const line of root.querySelectorAll<SVGLineElement>("[data-handle-line]")) {
    const item = model.paths[Number(line.dataset.contour)]?.nodes[Number(line.dataset.node)],
      p = item?.[line.dataset.handleLine as "incoming" | "outgoing"];
    if (!item || !p) continue;
    const from = transformPoint(matrix, item),
      to = transformPoint(matrix, p);
    for (const [key, value] of Object.entries({ x1: from.x, y1: from.y, x2: to.x, y2: to.y }))
      set(line, key, value);
  }
}
