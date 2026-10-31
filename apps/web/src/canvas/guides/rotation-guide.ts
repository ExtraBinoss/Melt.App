import type { RotationGuide } from "../interaction/snapping/rotation";
export function drawRotationGuide(
  root: SVGSVGElement,
  guide: RotationGuide,
  zoom: number,
  node: (name: string, attributes: Record<string, string | number>) => SVGElement,
) {
  const line = { x1: guide.from.x, y1: guide.from.y, x2: guide.to.x, y2: guide.to.y, fill: "none" };
  root.append(
    node("line", { ...line, stroke: "var(--background)", "stroke-width": 3 / zoom }),
    node("line", {
      ...line,
      class: "canvas-rotation-guide",
      "data-angle": guide.angle,
      stroke: "var(--guide-color, #ed66c2)",
      "stroke-width": 1 / zoom,
      "stroke-dasharray": `${4 / zoom} ${3 / zoom}`,
    }),
  );
  root.append(
    node("circle", {
      cx: guide.center.x,
      cy: guide.center.y,
      r: 3 / zoom,
      fill: "var(--background)",
      stroke: "var(--guide-color, #ed66c2)",
      "stroke-width": 1 / zoom,
    }),
  );
  const label = node("g", {
      class: "canvas-measurement-label canvas-rotation-angle",
      transform: `translate(${guide.label.x} ${guide.label.y}) scale(${1 / zoom})`,
    }),
    text = node("text", {
      x: 0,
      y: 0,
      dy: ".35em",
      "text-anchor": "middle",
      "font-size": 11,
      "font-weight": 600,
      "font-family": "Inter, sans-serif",
    });
  const value = `${Math.round(guide.angle)}°`;
  text.textContent = value;
  label.append(
    node("rect", {
      class: "measurement-label-background",
      x: -(value.length * 7 + 12) / 2,
      y: -9.5,
      width: value.length * 7 + 12,
      height: 19,
      rx: 4,
    }),
    text,
  );
  root.append(label);
}
