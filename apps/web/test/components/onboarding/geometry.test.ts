import { expect, test } from "vitest";
import { relativeGuideBox } from "../../../src/components/onboarding/tutorial/geometry";

test("guide geometry maps a scaled dialog into stable local coordinates", () => {
  expect(
    relativeGuideBox(
      { x: 510, y: 375, width: 100, height: 20 },
      { x: 110, y: 175, width: 800, height: 500 },
      1000,
      625,
    ),
  ).toEqual({ x: 500, y: 250, width: 125, height: 25 });
});

test("the same target retains local geometry throughout parent translation and scaling", () => {
  const a = relativeGuideBox(
    { x: 140, y: 240, width: 120, height: 40 },
    { x: 40, y: 40, width: 1000, height: 600 },
    1000,
    600,
  );
  const b = relativeGuideBox(
    { x: 175, y: 270, width: 114, height: 38 },
    { x: 80, y: 80, width: 950, height: 570 },
    1000,
    600,
  );
  expect(b).toEqual(a);
});
