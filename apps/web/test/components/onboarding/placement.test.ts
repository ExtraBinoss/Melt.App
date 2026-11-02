import { expect, test } from "vitest";
import { placeGuide } from "../../../src/components/onboarding/tutorial/placement";

test("the narrow editor keeps its card clear of the whole effect popup", () => {
  const anchor = { x: 131, y: 100, width: 370, height: 300 };
  const card = placeGuide(anchor, { width: 847, height: 760 }, 330, 268);
  expect(
    card.x >= anchor.x + anchor.width ||
      card.x + 330 <= anchor.x ||
      card.y >= anchor.y + anchor.height ||
      card.y + 268 <= anchor.y,
  ).toBe(true);
  expect(card.x).toBeGreaterThanOrEqual(12);
  expect(card.x + 330).toBeLessThanOrEqual(835);
});

test("a wide popup leaves room for the card above it when both sides are crowded", () => {
  const anchor = { x: 100, y: 350, width: 1000, height: 40 };
  const card = placeGuide(anchor, { width: 1200, height: 800 }, 330, 268);
  expect(card.y + 268).toBeLessThanOrEqual(anchor.y);
  expect(card.x).toBeGreaterThanOrEqual(12);
});

test("a reopened nearby menu keeps the current card position while it still fits", () => {
  const previous = { x: 722, y: 166 };
  expect(
    placeGuide(
      { x: 450, y: 200, width: 200, height: 200 },
      { width: 1200, height: 800 },
      330,
      268,
      previous,
    ),
  ).toEqual(previous);
});

test.each([
  ["toolbar", { x: 18, y: 80, width: 48, height: 640 }, { x: 1450, y: 12 }, "right"],
  ["centered toolbar", { x: 18, y: 324, width: 42, height: 490 }, { x: 1450, y: 12 }, "right"],
  ["properties", { x: 1490, y: 50, width: 420, height: 440 }, { x: 120, y: 240 }, "left"],
  ["layers", { x: 1490, y: 550, width: 420, height: 280 }, { x: 120, y: 240 }, "left"],
] as const)(
  "%s stays next to its target despite an unobstructed stale position",
  (_, anchor, previous, side) => {
    const card = placeGuide(anchor, { width: 1920, height: 840 }, 330, 268, previous);
    if (side === "right") expect(card.x - anchor.x - anchor.width).toBe(72);
    else expect(anchor.x - card.x - 330).toBe(72);
    expect(card.y + 134).toBeCloseTo(anchor.y + anchor.height / 2);
  },
);

test("a displaced control moves its card rather than keeping a distant previous position", () => {
  const card = placeGuide(
    { x: 1300, y: 800, width: 150, height: 36 },
    { width: 1600, height: 1000 },
    330,
    268,
    { x: 12, y: 12 },
  );
  expect(card.x).toBeGreaterThan(850);
  expect(card.y).toBeGreaterThan(500);
});

test("small target movements update coordinates immediately while retaining the free side", () => {
  const viewport = { width: 1200, height: 800 };
  const anchor = { x: 450, y: 200, width: 200, height: 200 };
  const previous = { x: 722, y: 166 };
  expect(placeGuide({ ...anchor, x: 454, y: 203 }, viewport, 330, 268, previous)).toEqual({
    x: 726,
    y: 169,
  });
});
