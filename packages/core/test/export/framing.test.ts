import { expect, test } from "vitest";
import { fitOutputRegion, resolveOutputFraming } from "../../src/export/framing";

test("capture formats inscribe within a fixed visible region without changing source coordinates", () => {
  const page = { width: 1440, height: 1080 };
  const result = resolveOutputFraming(page, {
    width: 1080,
    height: 1920,
    region: { x: 100, y: 100, width: 1200, height: 800 },
  });
  expect(result.region).toEqual({ x: 475, y: 100, width: 450, height: 800 });
  expect(result.width).toBe(1080);
  expect(result.height).toBe(1920);
  expect(result.scale).toBe(2.4);
  expect(page).toEqual({ width: 1440, height: 1080 });
  expect(fitOutputRegion({ x: 0, y: 0, width: 1920, height: 1080 }, 1000, 1000)).toEqual({
    x: 420,
    y: 0,
    width: 1080,
    height: 1080,
  });
});
test("original framing preserves fractional raster ceil and explicit physical dimensions", () => {
  expect(resolveOutputFraming({ width: 101.2, height: 50.1 }, undefined, 0.5)).toMatchObject({
    width: 51,
    height: 26,
    scale: 0.5,
  });
  expect(
    resolveOutputFraming({ width: 1440, height: 1080 }, { width: 1280, height: 720 }, 2),
  ).toMatchObject({
    width: 2560,
    height: 1440,
    region: { x: 0, y: 135, width: 1440, height: 810 },
  });
});
test("invalid and oversized frame requests fail rather than distorting or silently capping", () => {
  for (const framing of [
    { width: 0, height: 720 },
    { width: 1.5, height: 720 },
    { width: 16385, height: 720 },
    { width: 12000, height: 12000 },
    { width: 100, height: 100, region: { x: -10, y: 0, width: 20, height: 20 } },
  ])
    expect(() => resolveOutputFraming({ width: 1440, height: 1080 }, framing)).toThrow();
  expect(() => resolveOutputFraming({ width: 1440, height: 1080 }, undefined, 9)).toThrow();
});
