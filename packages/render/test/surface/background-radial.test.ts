import { expect, test } from "vitest";
import { paintControls, paintNode, updatePaintControls } from "../../src/surface/paint";
import { vec2 } from "three/tsl";
const stops = [
  { offset: 0, color: "#ffffff" },
  { offset: 1, color: "#221144" },
];
test("legacy ellipse defaults and authored circle center/size update stable GPU uniforms", () => {
  const controls = paintControls(),
    center = controls.center,
    radius = controls.radius;
  updatePaintControls(controls, "#000000", 900, 600, { kind: "radial", angle: 0, stops });
  expect(controls.center.value.toArray()).toEqual([0.5, 0.5]);
  expect(controls.radius.value).toBe(0.5);
  expect(controls.radialScale.value.toArray()).toEqual([1, 1]);
  updatePaintControls(controls, "#000000", 900, 600, {
    kind: "radial",
    angle: 0,
    stops,
    centerX: 0.2,
    centerY: 0.75,
    radius: 0.8,
    radialShape: "circle",
  });
  expect(controls.center).toBe(center);
  expect(controls.radius).toBe(radius);
  expect(controls.center.value.toArray()).toEqual([0.2, 0.75]);
  expect(controls.radius.value).toBe(0.8);
  expect(controls.radialScale.value.toArray()).toEqual([1.5, 1]);
  expect(paintNode(controls, vec2(1, 1)).isNode).toBe(true);
});
