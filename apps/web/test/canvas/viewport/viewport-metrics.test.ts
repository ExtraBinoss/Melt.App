import { expect, test, vi } from "vitest";
import { createViewportMetrics } from "../../../src/canvas/viewport/viewport-metrics";

test("camera constraints reuse dimensions until an actual input or resize measurement", () => {
  const element = document.createElement("div");
  let width = 1000;
  const measure = vi
    .spyOn(element, "getBoundingClientRect")
    .mockImplementation(() => ({ width, height: 800, left: 20, top: 30 }) as DOMRect);
  const metrics = createViewportMetrics({ current: element });
  expect(metrics.read()).toEqual({ width: 0, height: 0 });
  expect(measure).not.toHaveBeenCalled();
  metrics.measure();
  for (let i = 0; i < 60; i++) expect(metrics.read()).toEqual({ width: 1000, height: 800 });
  expect(measure).toHaveBeenCalledTimes(1);
  width = 700;
  metrics.measure();
  expect(metrics.read()).toEqual({ width: 700, height: 800 });
  expect(measure).toHaveBeenCalledTimes(2);
});
