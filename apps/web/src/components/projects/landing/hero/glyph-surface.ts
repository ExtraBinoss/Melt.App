import type { GlyphGeometry } from "./glyph-geometry";
const ns = "http://www.w3.org/2000/svg";
function node<K extends keyof SVGElementTagNameMap>(tag: K, parent: SVGElement) {
  const element = document.createElementNS(ns, tag);
  parent.append(element);
  return element;
}
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ramp = (value: number, from: number, to: number) => {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

/** Retained native glyph paths; node clouds settle onto their original curve endpoints. */
export function createGlyphSurface(
  stage: HTMLElement,
  heading: HTMLElement,
  glyphs: GlyphGeometry[],
) {
  const values = new WeakMap<SVGElement, Map<string, string>>();
  function attribute(element: SVGElement, name: string, value: string) {
    let previous = values.get(element);
    if (!previous) values.set(element, (previous = new Map()));
    if (previous.get(name) === value) return;
    previous.set(name, value);
    element.setAttribute(name, value);
  }
  const bounds = stage.getBoundingClientRect();
  const svg = document.createElementNS(ns, "svg");
  svg.classList.add("hero-glyph-overlay");
  attribute(svg, "aria-hidden", "true");
  const defs = node("defs", svg);
  const mask = node("mask", defs);
  const id = `hero-letter-mask-${crypto.randomUUID()}`;
  mask.id = id;
  attribute(mask, "maskUnits", "userSpaceOnUse");
  attribute(mask, "x", "-10");
  attribute(mask, "y", "-10");
  attribute(mask, "width", String(bounds.width + 20));
  attribute(mask, "height", String(bounds.height + 20));
  const paper = node("rect", mask);
  attribute(paper, "x", "-10");
  attribute(paper, "y", "-10");
  attribute(paper, "width", String(bounds.width + 20));
  attribute(paper, "height", String(bounds.height + 20));
  attribute(paper, "fill", "white");
  const items = glyphs.map((glyph, index) => {
    const hole = node("path", mask);
    attribute(hole, "d", glyph.d);
    attribute(hole, "fill", "black");
    attribute(hole, "stroke", "black");
    attribute(hole, "stroke-width", "1.5");
    attribute(hole, "opacity", "0");
    const group = node("g", svg);
    attribute(group, "data-hero-glyph", String(index));
    attribute(group, "data-hero-tone", String(glyph.tone ?? 0));
    attribute(group, "opacity", "0");
    group.style.color = `var(--hero-run-${glyph.tone ?? 0})`;
    const path = node("path", group);
    attribute(path, "d", glyph.d);
    attribute(path, "pathLength", "1");
    attribute(path, "stroke-dasharray", "1");
    const dots = glyph.points.map((point, pointIndex) => {
      const dot = node("circle", group);
      attribute(dot, "cx", String(point.x));
      attribute(dot, "cy", String(point.y));
      attribute(dot, "r", String(Math.max(1.8, Math.min(3, glyph.height * 0.022))));
      const seed = (index + 1) * 97 + pointIndex * 31;
      const amplitude = Math.min(1, glyph.height / 120);
      return {
        dot,
        dx: Math.sin(seed * 1.7) * 22 * amplitude,
        dy: Math.cos(seed * 2.3) * 32 * amplitude,
      };
    });
    return { hole, group, path, dots, phase: "new", points: -1, cloud: -1 };
  });
  stage.append(svg);
  let masked = false;
  const unmask = () => {
    if (!masked) return;
    masked = false;
    heading.style.removeProperty("mask-image");
  };
  stage.setAttribute("data-vector-ready", "");
  return {
    paint(index: number, progress: number, intro: boolean) {
      const item = items[index]!;
      if (progress < 0 || progress >= 1) {
        const phase = intro && progress >= 1 ? "filled" : "hidden";
        if (item.phase === phase) return;
        item.phase = phase;
        attribute(item.group, "opacity", intro && progress >= 1 ? "1" : "0");
        attribute(item.path, "fill-opacity", "1");
        attribute(item.path, "stroke-opacity", "0");
        item.points = 0;
        item.dots.forEach(({ dot }) => attribute(dot, "opacity", "0"));
        attribute(item.hole, "opacity", "0");
        return;
      }
      item.phase = "active";
      if (!intro && !masked) {
        masked = true;
        heading.style.maskImage = `url(#${id})`;
      }
      const fill = intro
        ? ramp(progress, 0.5, 0.8)
        : 1 - ramp(progress, 0, 0.08) + ramp(progress, 0.7, 0.95);
      const outline =
        ramp(progress, intro ? 0.12 : 0.01, intro ? 0.3 : 0.1) * (1 - ramp(progress, 0.72, 1));
      const points = ramp(progress, 0, intro ? 0.12 : 0.04) * (1 - ramp(progress, 0.7, 1));
      const cloud = 1 - ramp(progress, 0, intro ? 0.36 : 0.12);
      attribute(item.group, "opacity", "1");
      attribute(item.hole, "opacity", intro ? "0" : "1");
      attribute(item.path, "fill-opacity", String(clamp(fill)));
      attribute(item.path, "stroke-opacity", String(outline));
      attribute(
        item.path,
        "stroke-dashoffset",
        intro ? String(1 - ramp(progress, 0.12, 0.55)) : "0",
      );
      if (item.points !== points) {
        item.points = points;
        item.dots.forEach(({ dot }) => attribute(dot, "opacity", String(points)));
      }
      if (item.cloud !== cloud) {
        item.cloud = cloud;
        item.dots.forEach(({ dot, dx, dy }) =>
          attribute(dot, "transform", `translate(${dx * cloud} ${dy * cloud})`),
        );
      }
    },
    unmask,
    clear() {
      unmask();
      items.forEach((item) => {
        item.phase = "hidden";
        attribute(item.group, "opacity", "0");
        attribute(item.hole, "opacity", "0");
      });
    },
    dispose() {
      heading.style.removeProperty("mask-image");
      stage.removeAttribute("data-vector-ready");
      svg.remove();
    },
  };
}
