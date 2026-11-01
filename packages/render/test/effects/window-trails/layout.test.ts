import { expect, test } from "vitest";
import { createEffect } from "@musart/core";
import { createEffectUniforms, updateEffectUniforms } from "../../../src/effects/shared/uniforms";

test.each(["figure-eight", "orbit", "sweep"])(
  "matches the authored %s path with bounded shared uniforms",
  (path) => {
    const effect = createEffect("window-trails", {
      time: 8,
      settings: { count: 26, ribbons: 3, path, speed: -0.105, phase: -0.2 },
    });
    const controls = createEffectUniforms(effect, 405, 720, { width: 1080, height: 1920 });
    const layout = controls.windowTrails!;
    expect(layout.count.value).toBe(78);
    expect(layout.rectangles).toHaveLength(96);
    for (let i = 0; i < layout.count.value; i++) {
      const ribbon = i % 3,
        age = Math.floor(i / 3),
        at = 8 - ribbon * 1.8 - age * 0.045;
      const phase = at * -0.105 - 0.2,
        angle = (phase + ribbon * 0.333) * Math.PI * 2;
      const x =
        path === "sweep"
          ? (phase - Math.floor(phase)) * 2 - 1
          : path === "orbit"
            ? Math.cos(angle)
            : Math.sin(angle);
      const y =
        path === "sweep"
          ? Math.sin(angle) * 0.45
          : path === "orbit"
            ? Math.sin(angle)
            : Math.sin(angle * 2) * 0.85;
      const rectangle = layout.rectangles[i]!;
      expect(rectangle.x).toBeCloseTo(540 + x * 1080 * 0.32 - 180, 7);
      expect(rectangle.y).toBeCloseTo(960 + y * 1920 * 0.23 - 160, 7);
      expect(rectangle.z).toBe(ribbon + (age === 0 ? 4 : 0));
      expect(rectangle.w).toBeCloseTo(1 - (age / 26) * 0.16, 7);
      expect(rectangle.x).toBeGreaterThanOrEqual(layout.bounds.value.x);
      expect(rectangle.y).toBeGreaterThanOrEqual(layout.bounds.value.y);
      expect(rectangle.x + 372).toBeLessThanOrEqual(layout.bounds.value.z);
      expect(rectangle.y + 334).toBeLessThanOrEqual(layout.bounds.value.w);
    }
  },
);

test("compacts future copies, reuses vectors across seeks and ignores raster density and color-only changes", () => {
  const effect = createEffect("window-trails", {
    time: 8,
    settings: { count: 32, ribbons: 3, entranceDelay: 0, delay: 0 },
  });
  const controls = createEffectUniforms(effect, 405, 720, { width: 1080, height: 1920 });
  const layout = controls.windowTrails!,
    vectors = [...layout.rectangles],
    buffer = layout.windows,
    box = layout.bounds.value;
  expect(layout.count.value).toBe(96);
  const before = layout.rectangles.map((rectangle) => rectangle.toArray());
  updateEffectUniforms(controls, effect, 1080, 1920, { width: 1080, height: 1920 });
  expect(layout.update(controls.parameters, 8, 1080, 1920)).toBe(false);
  expect(layout.rectangles.map((rectangle) => rectangle.toArray())).toEqual(before);
  updateEffectUniforms(
    controls,
    { ...effect, settings: { ...effect.settings, paper: "#ff0000" } },
    405,
    720,
    { width: 1080, height: 1920 },
  );
  expect(layout.update(controls.parameters, 8, 1080, 1920)).toBe(false);
  updateEffectUniforms(
    controls,
    createEffect("window-trails", { time: 0, settings: { count: 32, ribbons: 3 } }),
    405,
    720,
    { width: 1080, height: 1920 },
  );
  expect(layout.count.value).toBe(1);
  expect(layout.rectangles[0]!.z).toBe(4);
  updateEffectUniforms(controls, effect, 405, 720, { width: 1080, height: 1920 });
  expect(layout.rectangles.map((rectangle) => rectangle.toArray())).toEqual(before);
  expect(layout.windows).toBe(buffer);
  expect(layout.bounds.value).toBe(box);
  for (let i = 0; i < vectors.length; i++) expect(layout.rectangles[i]).toBe(vectors[i]);
});

test("clears the union on an empty pose and recomputes authored coordinates after resize", () => {
  const effect = createEffect("window-trails");
  const controls = createEffectUniforms(effect, 405, 720, { width: 1080, height: 1920 });
  const layout = controls.windowTrails!;
  expect(layout.count.value).toBe(1);
  expect(layout.update(controls.parameters, -1, 1080, 1920)).toBe(true);
  expect(layout.count.value).toBe(0);
  expect(layout.bounds.value.toArray()).toEqual([0, 0, 0, 0]);
  expect(layout.update(controls.parameters, -1, 1080, 1920)).toBe(false);
  updateEffectUniforms(controls, effect, 810, 1440, { width: 2160, height: 3840 });
  expect(layout.count.value).toBe(1);
  expect(layout.rectangles[0]!.toArray()).toEqual([900, 1760, 4, 1]);
  expect(layout.bounds.value.toArray()).toEqual([900, 1760, 1272, 2094]);
});
