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
test("Studio covers the complete viewport with the selected composition and clamps empty margins", () => {
  const view = immersiveView(layout, { width: 1920, height: 1080 }, "a");
  expect(view.zoom).toBeCloseTo(1920 / 1440);
  expect(view.x).toBeCloseTo(240);
  expect(view.y).toBeCloseTo(0);
  const pan = immersiveView(layout, { width: 1920, height: 1080 }, "a", {
    x: 100000,
    y: -100000,
    zoom: 1,
  });
  expect(pan.x).toBeCloseTo(240);
  expect(pan.y).toBeCloseTo(-180);
  const selected = immersiveView(layout, { width: 1000, height: 600 }, "b");
  expect(selected.zoom).toBe(5);
  expect(selected.x).toBe(-4000);
  expect(immersiveView(layout, { width: 0, height: 0 }, "a", view)).toBe(view);
});
