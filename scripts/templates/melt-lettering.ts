import { Font, Face, getGlyphDelta, getGlyphPath, getGlyphPathWithVariation } from "text-shaper";
import { createOutlineFont } from "../../packages/render/src/surface/text/outlines";
import {
  editVectorPath,
  type MorphPoint,
  type MorphContour,
  type ShapeMorph,
  validateShapeMorph,
} from "@musart/core";
import reference from "../../apps/web/src/services/projects/templates/motion/morph-reference.json" with { type: "json" };
const buffer = await Bun.file("apps/web/public/fonts/inter/font.ttf").arrayBuffer();
const owner = createOutlineFont(Font.load(buffer), {
  Face,
  getGlyphDelta,
  getGlyphPath,
  getGlyphPathWithVariation,
});
const font = owner.font;
const area = (points: readonly MorphPoint[]) =>
  points.reduce((n, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return n + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
const glyphs = ["M", "E", "L", "T"].map((letter) => {
  const original = font.charToGlyph(letter),
    glyph = font.variation!.getTransform(original, { wght: 800 });
  const outline = glyph.getPath(0, 0, font.unitsPerEm),
    bounds = outline.getBoundingBox();
  const svg = outline.commands
    .map((c) =>
      c.type === "Z"
        ? "Z"
        : c.type === "M" || c.type === "L"
          ? `${c.type}${c.x} ${c.y}`
          : c.type === "Q"
            ? `Q${c.x1} ${c.y1} ${c.x} ${c.y}`
            : `C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`,
    )
    .join(" ");
  const loops = editVectorPath({ path: svg }).map((path) =>
    path.nodes.flatMap((a, i) => {
      const b = path.nodes[(i + 1) % path.nodes.length]!,
        p = a.outgoing ?? a,
        q = b.incoming ?? b;
      return Array.from({ length: a.outgoing || b.incoming ? 6 : 1 }, (_, index): MorphPoint => {
        const t = index / (a.outgoing || b.incoming ? 6 : 1),
          s = 1 - t;
        return [
          (s ** 3 * a.x + 3 * s * s * t * p.x + 3 * s * t * t * q.x + t ** 3 * b.x - bounds.x1) /
            (bounds.x2 - bounds.x1),
          (s ** 3 * a.y + 3 * s * s * t * p.y + 3 * s * t * t * q.y + t ** 3 * b.y - bounds.y1) /
            (bounds.y2 - bounds.y1),
        ];
      });
    }),
  );
  const outer = loops.reduce((a, b) => (Math.abs(area(a)) > Math.abs(area(b)) ? a : b));
  return {
    aspect: (bounds.x2 - bounds.x1) / (bounds.y2 - bounds.y1),
    contours: loops.map((points) => ({
      hole: Math.sign(area(points)) !== Math.sign(area(outer)),
      points,
    })),
  };
});
const round = (n: number) => Math.round(n * 1e7) / 1e7;
const selected = [0, 1, 2, 4];
const definition: ShapeMorph = {
  version: 1,
  sourceText: "MELT",
  sourceFont: { family: "Inter Variable", size: 121.5, weight: 800 },
  shapes: glyphs.map((glyph, index) => ({
    frames: reference.shapes[0]!.frames.map((_, frame) => {
      const boxes = reference.shapes.map((s) => s.frames[frame]!.box),
        left = Math.min(...boxes.map((b) => b[0])),
        right = Math.max(...boxes.map((b) => b[0]! + b[2]!));
      const width = right - left,
        gap = width * 0.012;
      const weights = selected.map((si, i) => {
        const first = reference.shapes[si]!.frames[0]!.box;
        return (boxes[si]![2]! * glyphs[i]!.aspect) / (first[2]! / first[3]!);
      });
      const total = weights.reduce((a, b) => a + b, 0),
        available = width - 3 * gap;
      const x =
        left +
        (weights.slice(0, index).reduce((a, b) => a + b, 0) / total) * available +
        index * gap;
      const box = boxes[selected[index]!]!,
        height = box[3]!;
      const amount = 0.015 * Math.min(1, (height - 0.08) / 0.89);
      const contours: MorphContour[] = glyph.contours.map((contour) => {
        const sign = Math.sign(area(contour.points));
        return {
          hole: contour.hole,
          points: contour.points.map((p, i): MorphPoint => {
            const prev = contour.points[(i - 1 + contour.points.length) % contour.points.length]!,
              next = contour.points[(i + 1) % contour.points.length]!;
            const dx = next[0] - prev[0],
              dy = next[1] - prev[1],
              length = Math.hypot(dx, dy) || 1,
              pad = Math.abs(amount);
            return [
              round((p[0] + ((sign * dy) / length) * amount + pad) / (1 + 2 * pad)),
              round((p[1] - ((sign * dx) / length) * amount + pad) / (1 + 2 * pad)),
            ];
          }),
        };
      });
      return {
        at: frame / 66,
        box: [
          round(x),
          round((1 - height) / 2),
          round((weights[index]! / total) * available),
          round(height),
        ],
        contours,
        easing: "linear",
      };
    }),
  })),
};
validateShapeMorph(definition);
await Bun.write(
  "apps/web/src/services/projects/templates/motion/melt-lettering.json",
  JSON.stringify(definition) + "\n",
);
owner.dispose();
console.log(
  `Authored MELT in Inter Variable 800 with ${definition.shapes.length} letters and the original 67-frame movement.`,
);
