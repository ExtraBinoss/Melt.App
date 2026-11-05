import type { Matrix4, Vector2 } from "three/webgpu";

export const SELECTION_CONTOUR_WIDTH = 1.25;

/** Expand the quad far enough for a screen-space stroke, including rotation/shear.
 * The inverse screen Jacobian maps its CSS-pixel support back into source UVs.
 */
export function contourPadding(
  mapping: Matrix4,
  width: number,
  height: number,
  padding: Vector2,
): boolean {
  const m = mapping.elements;
  const a = m[0]! * width,
    b = m[1]! * height,
    c = m[4]! * width,
    d = m[5]! * height;
  const determinant = Math.abs(a * d - b * c);
  if (!Number.isFinite(determinant) || determinant < 1e-12 || width <= 0 || height <= 0)
    return false;
  padding.set(
    (SELECTION_CONTOUR_WIDTH * (Math.abs(d) + Math.abs(c))) / determinant,
    (SELECTION_CONTOUR_WIDTH * (Math.abs(b) + Math.abs(a))) / determinant,
  );
  return true;
}
