import { expect, test } from "vitest";
import { Matrix4, Vector2 } from "three/webgpu";
import { contourPadding, SELECTION_CONTOUR_WIDTH } from "../../src/spatial/selection-contour-frame";

test("contour margins cover a CSS-pixel stroke at each zoom, including rotated and sheared source frames", () => {
  for (const zoom of [0.25, 1, 2.5]) {
    const mapping = new Matrix4().set(
      0.7,
      0.24,
      0,
      0.1,
      -0.3,
      0.5,
      0,
      -0.2,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    );
    const width = 800 * zoom,
      height = 600 * zoom,
      padding = new Vector2();
    expect(contourPadding(mapping, width, height, padding)).toBe(true);
    const [a, b, c, d] = [
      mapping.elements[0]! * width,
      mapping.elements[1]! * height,
      mapping.elements[4]! * width,
      mapping.elements[5]! * height,
    ];
    for (const dx of [-SELECTION_CONTOUR_WIDTH, SELECTION_CONTOUR_WIDTH])
      for (const dy of [-SELECTION_CONTOUR_WIDTH, SELECTION_CONTOUR_WIDTH]) {
        const u = (d * dx - c * dy) / (a * d - b * c);
        const v = (a * dy - b * dx) / (a * d - b * c);
        expect(Math.abs(u)).toBeLessThanOrEqual(padding.x + 1e-12);
        expect(Math.abs(v)).toBeLessThanOrEqual(padding.y + 1e-12);
      }
    // Remapping the expanded quad's UVs must leave the source silhouette unchanged.
    const original = new Vector2(0.2, 0.8);
    const expanded = new Vector2(
      (original.x + padding.x) / (1 + 2 * padding.x),
      (original.y + padding.y) / (1 + 2 * padding.y),
    );
    const restored = new Vector2(
      expanded.x * (1 + 2 * padding.x) - padding.x,
      expanded.y * (1 + 2 * padding.y) - padding.y,
    );
    expect(restored.distanceTo(original)).toBeLessThan(1e-12);
  }
});

test("hidden and degenerate source frames never publish invalid contour uniforms", () => {
  const padding = new Vector2();
  expect(contourPadding(new Matrix4(), 0, 600, padding)).toBe(false);
  expect(contourPadding(new Matrix4().makeScale(0, 1, 1), 800, 600, padding)).toBe(false);
  expect(contourPadding(new Matrix4(), Infinity, 600, padding)).toBe(false);
});
