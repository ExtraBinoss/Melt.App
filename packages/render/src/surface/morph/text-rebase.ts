import type { MorphContour, MorphShapeFrame, ShapeMorph } from "@musart/core";
import { inflateContours } from "./text-contours";

type Box = MorphShapeFrame["box"];
interface GlyphBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
function boxAt(frames: MorphShapeFrame[], at: number): Box {
  const right = frames.findIndex((frame) => frame.at >= at);
  if (right <= 0) return frames[0]!.box;
  const a = frames[right - 1]!,
    b = frames[right]!;
  const linear = (at - a.at) / (b.at - a.at);
  const t =
    b.easing === "easeOut"
      ? 1 - (1 - linear) ** 3
      : b.easing === "easeInOut"
        ? linear * linear * (3 - 2 * linear)
        : linear;
  return a.box.map((value, i) => value + (b.box[i]! - value) * t) as Box;
}

/** Authored motion is a reusable placement envelope, never another font's silhouette. */
export function rebaseTextMorph(
  authored: ShapeMorph,
  glyphs: GlyphBox[],
  outlines: MorphContour[][],
  inflate: number,
  sizeRatio = 1,
): ShapeMorph {
  const sources = glyphs.map(
    (_, i) =>
      authored.shapes[
        Math.round((i * (authored.shapes.length - 1)) / Math.max(1, glyphs.length - 1))
      ]!,
  );
  const top = Math.min(...glyphs.map((g) => g.y)),
    height = Math.max(...glyphs.map((g) => g.y + g.h)) - top;
  const initial = authored.shapes.map((shape) => shape.frames[0]!.box);
  const cx =
      (Math.min(...initial.map((box) => box[0])) +
        Math.max(...initial.map((box) => box[0] + box[2]))) /
      2,
    cy =
      (Math.min(...initial.map((box) => box[1])) +
        Math.max(...initial.map((box) => box[1] + box[3]))) /
      2;
  return {
    version: 1,
    shapes: glyphs.map((glyph, index) => {
      const source = sources[index]!,
        first = source.frames[0]!.box;
      const peak = Math.max(...source.frames.map((frame) => frame.box[3]));
      return {
        frames: source.frames.map((frame) => {
          const boxes = authored.shapes.map((shape) => boxAt(shape.frames, frame.at));
          const left = Math.min(...boxes.map((box) => box[0])),
            width = Math.max(...boxes.map((box) => box[0] + box[2])) - left;
          const gapRatio = Math.max(
            0,
            Math.min(0.3, 1 - boxes.reduce((sum, box) => sum + box[2], 0) / width),
          );
          const gap = glyphs.length > 1 ? (width * gapRatio) / (glyphs.length - 1) : 0;
          const weights = glyphs.map((g, i) => {
            const initial = sources[i]!.frames[0]!.box;
            return (
              (boxAt(sources[i]!.frames, frame.at)[2] * (g.w / height)) / (initial[2] / initial[3])
            );
          });
          const total = weights.reduce((sum, weight) => sum + weight, 0),
            available = width - gap * (glyphs.length - 1);
          const phase = Math.max(
            0,
            Math.min(1, (frame.box[3] - first[3]) / Math.max(1e-6, peak - first[3])),
          );
          return {
            at: frame.at,
            ...(frame.easing ? { easing: frame.easing } : {}),
            box: (
              [
                left +
                  (available * weights.slice(0, index).reduce((sum, weight) => sum + weight, 0)) /
                    total +
                  gap * index,
                frame.box[1] + (frame.box[3] * (glyph.y - top)) / height,
                (available * weights[index]!) / total,
                (frame.box[3] * glyph.h) / height,
              ] as Box
            ).map((value, i) =>
              i < 2
                ? (i === 0 ? cx : cy) + (value - (i === 0 ? cx : cy)) * sizeRatio
                : value * sizeRatio,
            ) as Box,
            contours: inflateContours(outlines[index]!, inflate * phase),
          };
        }),
      };
    }),
  };
}
