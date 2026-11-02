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
  const bounds = stage.getBoundingClientRect();
  const svg = document.createElementNS(ns, "svg");
  svg.classList.add("hero-glyph-overlay");
  svg.setAttribute("aria-hidden", "true");
  const defs = node("defs", svg);
  const mask = node("mask", defs);
  const id = `hero-letter-mask-${crypto.randomUUID()}`;
  mask.id = id;
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  mask.setAttribute("x", "-10");
  mask.setAttribute("y", "-10");
  mask.setAttribute("width", String(bounds.width + 20));
  mask.setAttribute("height", String(bounds.height + 20));
  const paper = node("rect", mask);
  paper.setAttribute("x", "-10");
  paper.setAttribute("y", "-10");
  paper.setAttribute("width", String(bounds.width + 20));
  paper.setAttribute("height", String(bounds.height + 20));
  paper.setAttribute("fill", "white");
  const items = glyphs.map((glyph, index) => {
    const hole = node("path", mask);
    hole.setAttribute("d", glyph.d);
    hole.setAttribute("fill", "black");
    hole.setAttribute("stroke", "black");
    hole.setAttribute("stroke-width", "1.5");
    hole.setAttribute("opacity", "0");
    const group = node("g", svg);
    group.setAttribute("data-hero-glyph", String(index));
    group.setAttribute("data-hero-tone", String(glyph.tone ?? 0));
    group.setAttribute("opacity", "0");
    group.style.color = `var(--hero-run-${glyph.tone ?? 0})`;
    const path = node("path", group);
    path.setAttribute("d", glyph.d);
    path.setAttribute("pathLength", "1");
    path.setAttribute("stroke-dasharray", "1");
    const dots = glyph.points.map((point, pointIndex) => {
      const dot = node("circle", group);
      dot.setAttribute("cx", String(point.x));
      dot.setAttribute("cy", String(point.y));
      dot.setAttribute("r", String(Math.max(1.8, Math.min(3, glyph.height * 0.022))));
      const seed = (index + 1) * 97 + pointIndex * 31;
      const amplitude = Math.min(1, glyph.height / 120);
      return {
        dot,
        dx: Math.sin(seed * 1.7) * 22 * amplitude,
        dy: Math.cos(seed * 2.3) * 32 * amplitude,
      };
    });
    return { hole, group, path, dots };
  });
  stage.append(svg);
  heading.style.maskImage = `url(#${id})`;
  stage.setAttribute("data-vector-ready", "");
  return {
    paint(index: number, progress: number, intro: boolean) {
      const item = items[index]!;
      if (progress < 0 || progress >= 1) {
        item.group.setAttribute("opacity", intro && progress >= 1 ? "1" : "0");
        item.path.setAttribute("fill-opacity", "1");
        item.path.setAttribute("stroke-opacity", "0");
        item.dots.forEach(({ dot }) => dot.setAttribute("opacity", "0"));
        item.hole.setAttribute("opacity", "0");
        return;
      }
      const fill = intro
        ? ramp(progress, 0.5, 0.8)
        : 1 - ramp(progress, 0, 0.08) + ramp(progress, 0.7, 0.95);
      const outline =
        ramp(progress, intro ? 0.12 : 0.01, intro ? 0.3 : 0.1) * (1 - ramp(progress, 0.72, 1));
      const points = ramp(progress, 0, intro ? 0.12 : 0.04) * (1 - ramp(progress, 0.7, 1));
      const cloud = 1 - ramp(progress, 0, intro ? 0.36 : 0.12);
      item.group.setAttribute("opacity", "1");
      item.hole.setAttribute("opacity", intro ? "0" : "1");
      item.path.setAttribute("fill-opacity", String(clamp(fill)));
      item.path.setAttribute("stroke-opacity", String(outline));
      item.path.setAttribute(
        "stroke-dashoffset",
        intro ? String(1 - ramp(progress, 0.12, 0.55)) : "0",
      );
      item.dots.forEach(({ dot, dx, dy }) => {
        dot.setAttribute("opacity", String(points));
        dot.setAttribute("transform", `translate(${dx * cloud} ${dy * cloud})`);
      });
    },
    clear() {
      items.forEach(({ group, hole }) => {
        group.setAttribute("opacity", "0");
        hole.setAttribute("opacity", "0");
      });
    },
    dispose() {
      heading.style.removeProperty("mask-image");
      stage.removeAttribute("data-vector-ready");
      svg.remove();
    },
  };
}
