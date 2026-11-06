import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { trailRenderBounds } from "../../../src/effects/trail/extent";
import { projectedRaster } from "../../../src/compositing/projected-raster";

it("retains echoes beyond the current glyph/source box in authored object pixels", () => {
  const effect = createEffect("trail", { settings: { offsetX: 16, offsetY: -4, echoCount: 3 } }),
    bounds = { x: -2, y: -3, width: 24, height: 20 },
    expanded = trailRenderBounds([effect], bounds, { width: 20, height: 16 });
  expect(expanded).toEqual({ x: -2, y: -15, width: 72, height: 32 });
  expect(bounds).toEqual({ x: -2, y: -3, width: 24, height: 20 });
  expect(
    trailRenderBounds(
      [{ ...effect, settings: { ...effect.settings, expandBounds: false } }],
      bounds,
      { width: 20, height: 16 },
    ),
  ).toBe(bounds);
  for (const inactive of [
    { ...effect, enabled: false },
    { ...effect, amount: 0 },
    { ...effect, settings: { ...effect.settings, fade: 0 } },
  ])
    expect(trailRenderBounds([inactive], bounds, { width: 20, height: 16 })).toBe(bounds);
});

it("includes rotated offset and cumulative scale echoes while reducing only raster density at device/budget limits", () => {
  const effect = createEffect("trail", {
      settings: { offsetX: 20, angle: 90, spread: 0.25, echoCount: 8 },
    }),
    bounds = trailRenderBounds(
      [effect],
      { x: 0, y: 0, width: 100, height: 20 },
      { width: 100, height: 20 },
    );
  expect(bounds.width).toBeCloseTo(100 * 1.25 ** 8);
  expect(bounds.y + bounds.height).toBeCloseTo(10 + 10 * 1.25 ** 8 + 160);
  const raster = projectedRaster(bounds, 2, 128, 4096);
  expect(raster.width).toBeLessThanOrEqual(128);
  expect(raster.height).toBeLessThanOrEqual(128);
  expect(raster.width * raster.height).toBeLessThanOrEqual(4096);
  expect(bounds.width).toBeGreaterThan(500);
});
