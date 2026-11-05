import { expect, it } from "vitest";
import { createLayer } from "@musart/core";
import { shapeControls, shapeNode, updateShape } from "../../src/surface/shapes";
it("keeps rectangle, ellipse, fill and stroke as GPU SDF uniforms", () => {
  const controls = shapeControls();
  const node = shapeNode(controls);
  const key = node.getCacheKey();
  updateShape(
    controls,
    createLayer("rectangle", {
      width: 100,
      height: 60,
      radius: 100,
      strokeWidth: 3,
      fill: "#ff000080",
    }),
    2,
  );
  expect(controls.size.value.toArray()).toEqual([200, 120]);
  expect(controls.radius.value).toBe(60);
  expect(controls.strokeWidth.value).toBe(6);
  expect(controls.fill.value.w).toBe(128 / 255);
  updateShape(controls, createLayer("ellipse"), 1);
  expect(controls.ellipse.value).toBe(1);
  expect(node.getCacheKey()).toBe(key);
});

it("shares native gradient paint uniforms for rectangle/ellipse source surfaces at their raster density", () => {
  const controls = shapeControls();
  const gradient = {
    kind: "radial" as const,
    angle: 0,
    radialShape: "circle" as const,
    centerX: 0.25,
    centerY: 0.7,
    radius: 0.8,
    stops: [
      { offset: 0, color: "#00ff00" },
      { offset: 1, color: "#112255" },
    ],
  };
  updateShape(
    controls,
    createLayer("rectangle", { width: 300, height: 200, fillGradient: gradient }),
    2,
  );
  expect(controls.fill).toBe(controls.paint.solid);
  expect(controls.paint.mode.value).toBe(2);
  expect(controls.paint.size.value.toArray()).toEqual([600, 400]);
  expect(controls.paint.radialScale.value.toArray()).toEqual([1.5, 1]);
  expect(controls.paint.center.value.toArray()).toEqual([0.25, 0.7]);
  updateShape(controls, createLayer("ellipse", { width: 300, height: 200 }), 1);
  expect(controls.paint.mode.value).toBe(0);
  expect(controls.ellipse.value).toBe(1);
});
