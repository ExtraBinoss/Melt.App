import { expect, test } from "vitest";
import { immersiveView } from "../../../src/canvas/viewport/immersive";
const layout = {
  width: 1800,
  height: 1080,
  origin: { x: 0, y: 0 },
  boards: [
    { id: "a", name: "A", x: 0, y: 0, width: 1440, height: 1080 },
    { id: "b", name: "B", x: 1600, y: 0, width: 200, height: 200 },
  ],
};
test("Studio fits the complete composition without stretching or cropping with the selected composition and clamps empty margins", () => {
  const view = immersiveView(layout, { width: 1920, height: 1080 }, "a");
  expect(view.zoom).toBeCloseTo(1);
  expect(view.x).toBeCloseTo(180);
  expect(view.y).toBeCloseTo(0);
  const pan = immersiveView(layout, { width: 1920, height: 1080 }, "a", {
    x: 100000,
    y: -100000,
    zoom: 1,
  });
  expect(pan.x).toBeCloseTo(180);
  expect(pan.y).toBeCloseTo(0);
  const selected = immersiveView(layout, { width: 1000, height: 600 }, "b");
  expect(selected.zoom).toBe(3);
  expect(selected.x).toBe(-2400);
  expect(immersiveView(layout, { width: 0, height: 0 }, "a", view)).toBe(view);
});

test("a 1920 × 1080 composition stays completely visible on portrait screens", () => {
  const view = immersiveView(
    {
      width: 1920,
      height: 1080,
      boards: [{ id: "wide", name: "Wide", x: 0, y: 0, width: 1920, height: 1080 }],
    },
    { width: 390, height: 844 },
    "wide",
  );
  expect(view.zoom).toBeCloseTo(390 / 1920);
  expect(1080 * view.zoom).toBeLessThan(844);
  expect(view.x).toBeCloseTo(0);
  expect(view.y).toBeCloseTo(0);
});
