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
  const previous = { x: 800, y: 200 };
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
