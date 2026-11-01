import { expect, test } from "vitest";
import { createEffect, createLayer, validateShapeMorph } from "@musart/core";
import { textMorph } from "../../../src/surface/morph/text";
import { layoutText } from "../../../src/surface/text/layout";
import { outlineFont } from "../../text-fixture";
import { morphFixture } from "../../morph-fixture";
import { inflateContours } from "../../../src/surface/morph/text-contours";
import { fontFamilyIdentity } from "../../../src/surface/text/fonts";
import lettering from "../../../../../apps/web/src/services/projects/templates/motion/morphing-type/lettering.json";
test("regenerates edited text from shaped outlines while retaining matching authored targets", () => {
  const font = outlineFont(),
    layer = createLayer("text", { text: "AV", width: 300, height: 100, fontSize: 48 });
  const authored = { ...morphFixture(), sourceText: "AV" };
  const effect = createEffect("morph", { shapeMorph: authored });
  expect(textMorph(layer, effect, font, layoutText(layer, font))).toBe(authored);
  const changed = { ...layer, text: "B" };
  const generated = textMorph(changed, effect, font, layoutText(changed, font));
  validateShapeMorph(generated);
  expect(generated.shapes).toHaveLength(1);
  expect(generated).not.toBe(authored);
  expect(() => textMorph({ ...layer, text: " " }, effect, font, [])).toThrow(
    "visible text outlines",
  );
});

test("the bundled DynaPuff face retains authored contours; another font/text/weight retains its 67-pose motion", () => {
  validateShapeMorph(lettering);
  const font = outlineFont(),
    layer = createLayer("text", {
      text: "MELT",
      fontFamily: "DynaPuff",
      fontSize: 121.5,
      fontWeight: 700,
      width: 1500,
      height: 1080,
    });
  const effect = createEffect("morph", { shapeMorph: lettering });
  expect(textMorph(layer, effect, font, layoutText(layer, font))).toBe(lettering);
  expect(fontFamilyIdentity('  "Inter Variable" ')).toBe(fontFamilyIdentity("Inter"));
  expect(fontFamilyIdentity("custom:Inter")).not.toBe(fontFamilyIdentity("Inter"));
  expect(fontFamilyIdentity("Unlisted family")).not.toBe(fontFamilyIdentity("Inter"));
  for (const patch of [{ fontFamily: "Tinos" }, { fontWeight: 400 }, { text: "ABV" }]) {
    const changed = { ...layer, ...patch };
    const result = textMorph(changed, effect, font, layoutText(changed, font));
    validateShapeMorph(result);
    expect(result).not.toBe(lettering);
    expect(result.shapes).toHaveLength(changed.text.length);
    for (const shape of result.shapes) {
      expect(shape.frames.map((frame) => frame.at)).toEqual(
        lettering.shapes[0]!.frames.map((frame) => frame.at),
      );
      expect(Math.max(...shape.frames.map((frame) => frame.box[3]))).toBeGreaterThan(0.95);
      // The test font is a rectangle. These endpoints must be its own four sides,
      // never the authored MELT silhouette or the previous 128-point superellipse.
      expect(shape.frames[0]!.contours[0]!.points).toHaveLength(16);
    }
  }
  const larger = { ...layer, fontSize: 243 };
  const scaled = textMorph(larger, effect, font, layoutText(larger, font));
  expect(scaled.shapes[0]!.frames[0]!.box[3]).toBeCloseTo(
    lettering.shapes[0]!.frames[0]!.box[3] * 2,
  );
});

test("generated Inflate preserves concave letter structure and counter locations", () => {
  const glyph = [
    {
      hole: false,
      points: [
        [0, 0],
        [1, 0],
        [1, 0.2],
        [0.2, 0.2],
        [0.2, 0.8],
        [1, 0.8],
        [1, 1],
        [0, 1],
      ] as const,
    },
    {
      hole: true,
      points: [
        [0.05, 0.35],
        [0.05, 0.6],
        [0.15, 0.6],
        [0.15, 0.35],
      ] as const,
    },
  ].map((c) => ({ ...c, points: c.points.map((p) => [...p] as [number, number]) }));
  const inflated = inflateContours(glyph, 1);
  expect(inflated.map((c) => c.hole)).toEqual([false, true]);
  expect(inflated[0]!.points).toHaveLength(8);
  expect(inflated[0]!.points[3]![0]).toBeLessThan(0.3);
  expect(inflated[1]!.points.every((p) => p[1] > 0.3 && p[1] < 0.65)).toBe(true);
  expect(inflateContours(glyph, 0)).toBe(glyph);
  expect(glyph[0]!.points[3]).toEqual([0.2, 0.2]);
});
