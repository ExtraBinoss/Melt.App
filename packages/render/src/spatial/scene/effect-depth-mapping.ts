import type { Bounds, Composition, Matrix } from "@musart/core";
import { Matrix3, Vector3 } from "three/webgpu";

/** Source UVs have Y up; native framebuffer/depth UVs have Y down on both backends. */
export function effectDepthUv(
  page: Pick<Composition, "width" | "height">,
  transport?: Bounds,
  layout?: Matrix,
  projection?: readonly number[],
  viewport?: Bounds,
): readonly number[] {
  const gate = viewport ?? { x: 0, y: 0, width: page.width, height: page.height };
  if (!transport) return new Matrix3().set(1, 0, 0, 0, -1, 1, 0, 0, 1).elements;
  const [a, b, c, d, e, f] = layout ?? [1, 0, 0, 1, 0, 0];
  const result = new Matrix3().set(
    1 / gate.width,
    0,
    -gate.x / gate.width,
    0,
    1 / gate.height,
    -gate.y / gate.height,
    0,
    0,
    1,
  );
  result.multiply(new Matrix3().set(a, c, e, b, d, f, 0, 0, 1));
  // The optional projection is projected source-local -> authored plane. Effects
  // on those planes require the inverse before applying classic layout once.
  if (projection) result.multiply(new Matrix3().fromArray(projection).invert());
  result.multiply(
    new Matrix3().set(
      transport.width,
      0,
      transport.x,
      0,
      -transport.height,
      transport.y + transport.height,
      0,
      0,
      1,
    ),
  );
  return result.elements;
}

/** Point focus belongs to the full authored owner, independently of transport/window crops. */
export function effectFocusPoint(
  width: number,
  height: number,
  x: number,
  y: number,
  layout?: Matrix,
  projection?: readonly number[],
) {
  const point = new Vector3(x * width, y * height, 1);
  if (projection) point.applyMatrix3(new Matrix3().fromArray(projection).invert());
  if (!Number.isFinite(point.z) || Math.abs(point.z) < 1e-10)
    throw Error("Depth focus point crosses the native projection horizon");
  point.multiplyScalar(1 / point.z);
  const [a, b, c, d, e, f] = layout ?? [1, 0, 0, 1, 0, 0];
  const result = { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
  if (!Number.isFinite(result.x) || !Number.isFinite(result.y))
    throw Error("Depth focus point is outside the finite native camera plane");
  return result;
}
