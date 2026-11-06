import { expect, it } from "vitest";
import { varyPalette, validateSavedPalette } from "../../src/index";
const colors = [
  { id: "light", name: "Light", value: "#e8b59f" },
  { id: "dark", name: "Dark", value: "#623a2d" },
  { id: "locked", name: "Logo", value: "#abc8", locked: true },
  { id: "neutral", name: "Paper", value: "#ffffff" },
];
it("generates deterministic harmonious colors, keeping locks, alpha, neutral anchors, names and identities exact", () => {
  const result = varyPalette(colors, 0.3);
  expect(result).toEqual(varyPalette(colors, 0.3));
  expect(result[0]!.value).not.toBe(colors[0]!.value);
  expect(result[1]!.value).not.toBe(colors[1]!.value);
  expect(result.slice(2)).toEqual(colors.slice(2));
  expect(colors[0]!.value).toBe("#e8b59f");
  validateSavedPalette({ id: "generated", name: "Company 2", colors: result });
  const alpha = varyPalette([{ id: "alpha", name: "Alpha", value: "#e8563780" }], 0.2)[0]!.value;
  expect(alpha).toMatch(/^#[0-9a-f]{6}80$/);
});
it("rejects corrupt saved colors, duplicate swatch identities, oversized palettes and invalid seeds", () => {
  expect(() => varyPalette([{ id: "bad", name: "Bad", value: "nonsense" }], 0.5)).toThrow();
  expect(() => varyPalette(colors, NaN)).toThrow();
  for (const palette of [
    { id: "a", name: "A", colors: [] },
    { id: "a", name: "A", colors: [colors[0], colors[0]] },
    {
      id: "a",
      name: "A",
      colors: Array.from({ length: 33 }, (_, i) => ({ ...colors[0], id: `${i}` })),
    },
  ])
    expect(() => validateSavedPalette(palette)).toThrow();
});
