import { resolveEffectSettings, type Effect, type Layer, type ShapeMorph } from "@musart/core";
import type { OutlineFont } from "../text/outlines";
import type { PlacedGlyph } from "../text/layout";
import { glyphContours, inflateContours } from "./text-contours";
import { rebaseTextMorph } from "./text-rebase";
import { fontFamilyIdentity } from "../text/fonts";

/** Font shaping remains native and editable; arbitrary contour targets use the same renderer. */
export function textMorph(
  layer: Layer,
  effect: Effect,
  font: OutlineFont,
  layout: PlacedGlyph[],
): ShapeMorph {
  const authored = effect.shapeMorph,
    sourceFont = authored?.sourceFont;
  if (
    authored &&
    (authored.sourceText === undefined || authored.sourceText === layer.text) &&
    (!sourceFont ||
      (fontFamilyIdentity(sourceFont.family) === fontFamilyIdentity(layer.fontFamily) &&
        sourceFont.weight === layer.fontWeight &&
        sourceFont.size === layer.fontSize))
  )
    return authored;
  const settings = resolveEffectSettings(effect),
    scale = layer.fontSize / font.unitsPerEm;
  const glyphs = layout
    .map(({ glyph, x, baseline }) => {
      const path = glyph.getPath(0, 0, font.unitsPerEm, { xScale: 1, yScale: 1 }),
        bounds = path.getBoundingBox();
      return {
        path,
        bounds,
        x: x + bounds.x1 * scale,
        y: baseline + bounds.y1 * scale,
        w: (bounds.x2 - bounds.x1) * scale,
        h: (bounds.y2 - bounds.y1) * scale,
      };
    })
    .filter((glyph) => glyph.w > 0 && glyph.h > 0);
  if (!glyphs.length) throw Error("Morph needs visible text outlines");
  const left = Math.min(...glyphs.map((g) => g.x)),
    top = Math.min(...glyphs.map((g) => g.y)),
    right = Math.max(...glyphs.map((g) => g.x + g.w)),
    bottom = Math.max(...glyphs.map((g) => g.y + g.h));
  const outlines = glyphs.map((g) => glyphContours(g.path.commands, g.bounds));
  if (authored)
    return rebaseTextMorph(
      authored,
      glyphs,
      outlines,
      Number(settings.inflate),
      layer.fontSize / (authored.sourceFont?.size ?? layer.fontSize),
    );
  const grow = Math.min(
    1.8,
    (layer.width / Math.max(1, right - left)) * 0.96,
    (layer.height / Math.max(1, bottom - top)) * 0.96,
  );
  const stretch = Math.min(
    grow * Number(settings.stretch),
    (layer.height / Math.max(1, bottom - top)) * 0.96,
  );
  const cx = (left + right) / 2,
    cy = (top + bottom) / 2;
  return {
    version: 1,
    shapes: glyphs.map((g, index) => {
      const from = outlines[index]!;
      return {
        frames: [
          {
            at: 0,
            box: [g.x / layer.width, g.y / layer.height, g.w / layer.width, g.h / layer.height],
            contours: from,
          },
          {
            at: 1,
            box: [
              (cx + (g.x - cx) * grow) / layer.width,
              (cy + (g.y - cy) * stretch) / layer.height,
              (g.w * grow) / layer.width,
              (g.h * stretch) / layer.height,
            ],
            contours: inflateContours(from, Number(settings.inflate)),
            easing: "easeOut",
          },
        ],
      };
    }),
  };
}
