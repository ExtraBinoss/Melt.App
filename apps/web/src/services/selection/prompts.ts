export interface SelectionPoint {
  x: number;
  y: number;
  label: 0 | 1;
}
export interface SelectionBox {
  x: number;
  y: number;
  right: number;
  bottom: number;
}
export interface SelectionPrompt {
  points: readonly SelectionPoint[];
  box?: SelectionBox;
}
export interface ObjectCandidate {
  x: number;
  y: number;
  score: number;
}
export const MAX_SELECTION_POINTS = 64;
/** SAM labels: foreground 1, background 0, box corners 2/3, padding -1. */
export function promptTensors(
  prompt: SelectionPrompt,
  width: number,
  height: number,
  size: number,
) {
  if (!Array.isArray(prompt.points) || prompt.points.length > MAX_SELECTION_POINTS)
    throw Error("Too many object selection points.");
  const points = [...prompt.points];
  const coordinates: number[] = [],
    labels: number[] = [];
  function add(x: number, y: number, label: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height)
      throw Error("Selection position is outside the image.");
    coordinates.push((x * size) / width, (y * size) / height);
    labels.push(label);
  }
  if (prompt.box) {
    const { x, y, right, bottom } = prompt.box;
    if (right <= x || bottom <= y) throw Error("Invalid selection rectangle.");
    add(x, y, 2);
    add(right, bottom, 3);
  }
  for (const point of points) {
    if (point.label !== 0 && point.label !== 1) throw Error("Invalid selection point label.");
    add(point.x, point.y, point.label);
  }
  if (!labels.length) throw Error("Object selection needs a point or rectangle.");
  if (!prompt.box) {
    coordinates.push(0, 0);
    labels.push(-1);
  }
  return {
    coordinates: new Float32Array(coordinates),
    labels: new Int32Array(labels),
    count: labels.length,
  };
}
