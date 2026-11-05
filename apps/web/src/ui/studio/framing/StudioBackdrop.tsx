import { useEffect, useId, useRef } from "react";
import { backgroundLayer, type FillGradient } from "@musart/core";
import type { SpatialCanvasProps } from "../../../canvas/spatial/CanvasSpatialEditing";
import "./backdrop.css";

const NS = "http://www.w3.org/2000/svg";

/** Continue ordinary paint beyond the camera gate without scaling the composition or its objects. */
export function StudioBackdrop({ controller, viewSource, viewport }: SpatialCanvasProps) {
  const root = useRef<SVGSVGElement>(null);
  const id = useId();
  useEffect(() => {
    const svg = root.current,
      element = viewport.current;
    if (!svg || !element) return;
    const defs = svg.querySelector("defs")!;
    const rectangles = [svg.querySelector("[data-base]")!, svg.querySelector("[data-paint]")!];
    let size = { width: element.clientWidth, height: element.clientHeight };
    let stamp = "";
    const paint = (at: number, color: string, gradient?: FillGradient) => {
      const { page } = controller.read();
      const name = `${id}-${at}`;
      if (!gradient) return rectangles[at]!.setAttribute("fill", color);
      const radial = gradient.kind === "radial";
      const node = document.createElementNS(NS, radial ? "radialGradient" : "linearGradient");
      node.id = name;
      node.setAttribute("gradientUnits", "userSpaceOnUse");
      node.setAttribute("color-interpolation", "sRGB");
      if (radial) {
        const span = gradient.radialShape === "circle" ? Math.min(page.width, page.height) : 1;
        node.setAttribute("cx", String((gradient.centerX ?? 0.5) * (span === 1 ? 1 : page.width)));
        node.setAttribute("cy", String((gradient.centerY ?? 0.5) * (span === 1 ? 1 : page.height)));
        node.setAttribute("r", String((gradient.radius ?? 0.5) * span));
        if (span === 1)
          node.setAttribute("gradientTransform", `scale(${page.width} ${page.height})`);
      } else {
        const angle = (gradient.angle * Math.PI) / 180,
          dx = Math.cos(angle),
          dy = Math.sin(angle);
        const span = Math.abs(dx) * page.width + Math.abs(dy) * page.height;
        for (const [key, value] of Object.entries({
          x1: page.width / 2 - (dx * span) / 2,
          y1: page.height / 2 - (dy * span) / 2,
          x2: page.width / 2 + (dx * span) / 2,
          y2: page.height / 2 + (dy * span) / 2,
        }))
          node.setAttribute(key, String(value));
      }
      for (const stop of gradient.stops) {
        const child = document.createElementNS(NS, "stop");
        child.setAttribute("offset", String(stop.offset));
        child.setAttribute("stop-color", stop.color);
        node.append(child);
      }
      defs.append(node);
      rectangles[at]!.setAttribute("fill", `url(#${name})`);
    };
    const update = () => {
      const { page } = controller.read(),
        view = viewSource.read();
      if (size.width <= 0 || size.height <= 0 || view.zoom <= 0) return;
      const x = page.width / 2 - (size.width / 2 + view.x) / view.zoom;
      const y = page.height / 2 - (size.height / 2 + view.y) / view.zoom;
      const width = size.width / view.zoom,
        height = size.height / view.zoom;
      svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
      for (const rect of rectangles)
        for (const [key, value] of Object.entries({ x, y, width, height }))
          rect.setAttribute(key, String(value));
      const layer = backgroundLayer(page);
      const next = JSON.stringify([
        page.width,
        page.height,
        page.background,
        page.backgroundGradient,
        layer?.visible,
        layer?.fill,
        layer?.fillGradient,
        layer?.opacity,
      ]);
      if (next === stamp) return;
      stamp = next;
      defs.replaceChildren();
      paint(0, page.background, page.backgroundGradient);
      paint(
        1,
        layer?.visible ? layer.fill : "transparent",
        layer?.visible ? layer.fillGradient : undefined,
      );
      rectangles[1]!.setAttribute("opacity", String(layer?.opacity ?? 1));
    };
    const stopScene = controller.subscribe(update),
      stopView = viewSource.subscribe(update);
    const resize = new ResizeObserver(([entry]) => {
      if (entry) size = entry.contentRect;
      update();
    });
    resize.observe(element);
    update();
    return () => {
      stopScene();
      stopView();
      resize.disconnect();
    };
  }, [controller, viewSource, viewport, id]);
  return (
    <svg
      ref={root}
      className="studio-backdrop"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-studio-backdrop
    >
      <defs />
      <rect data-base />
      <rect data-paint />
    </svg>
  );
}
