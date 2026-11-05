import { transformPoint, type Matrix } from "@musart/core";

export const ROTATION_HANDLE_OFFSET = 36;

/** Screen-sized, upright grip outside the top edge, including scaled or mirrored parents. */
export function rotationHandlePlacement(matrix: Matrix, zoom: number) {
  const [a, b, c, d] = matrix;
  const determinant = a * d - b * c;
  const edge = Math.hypot(a, b);
  if (Math.abs(determinant) < 1e-10 || edge < 1e-10) {
    return {
      transform: `translateY(${-ROTATION_HANDLE_OFFSET / zoom}px) scale(${1 / zoom})`,
      offset: { x: 0, y: -ROTATION_HANDLE_OFFSET / zoom },
    };
  }
  const distance = (Math.sign(determinant) * ROTATION_HANDLE_OFFSET) / (edge * zoom);
  const offset = { x: b * distance, y: -a * distance };
  const x = (d * offset.x - c * offset.y) / determinant;
  const y = (a * offset.y - b * offset.x) / determinant;
  return {
    transform: `matrix(${d / determinant / zoom},${-b / determinant / zoom},${-c / determinant / zoom},${a / determinant / zoom},${x},${y})`,
    offset,
  };
}

export function rotationHandlePoint(width: number, matrix: Matrix, zoom: number) {
  const top = transformPoint(matrix, { x: width / 2, y: 0 });
  const { offset } = rotationHandlePlacement(matrix, zoom);
  return { x: top.x + offset.x, y: top.y + offset.y };
}
