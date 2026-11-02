type CanvasStyleProperty =
  | "width"
  | "height"
  | "left"
  | "top"
  | "display"
  | "opacity"
  | "borderWidth"
  | "transform"
  | "transformOrigin"
  | "marginLeft"
  | "marginTop"
  | "maxWidth";
type CanvasStyle = Partial<Pick<CSSStyleDeclaration, CanvasStyleProperty>>;
interface PaintedValue {
  input: string;
  serialized: string;
}
const painted = new WeakMap<HTMLElement, Partial<Record<CanvasStyleProperty, PaintedValue>>>();

/** Native CSSOM normalizes transforms. Retain its serialization, while repairing external edits. */
export function paintCanvasStyle(node: HTMLElement, next: CanvasStyle) {
  let previous = painted.get(node);
  for (const property of Object.keys(next) as CanvasStyleProperty[]) {
    const input = next[property]!,
      current = node.style[property],
      last = previous?.[property];
    if (current === input || (last?.input === input && last.serialized === current)) continue;
    node.style[property] = input;
    if (!previous) {
      previous = {};
      painted.set(node, previous);
    }
    previous[property] = { input, serialized: node.style[property] };
  }
}
