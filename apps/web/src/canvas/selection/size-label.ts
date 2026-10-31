import { invertMatrix, transformPoint, type Layer, type Matrix } from "@musart/core";

/** A screen-upright label beneath the visual bounds, including flipped/nested transforms. */
export function selectionSizeLabel(
  layer: Pick<Layer, "width" | "height">,
  world: Matrix,
  zoom: number,
) {
  const corners = [
    [0, 0],
    [layer.width, 0],
    [layer.width, layer.height],
    [0, layer.height],
  ].map(([x, y]) => transformPoint(world, { x: x!, y: y! }));
  let inverse: Matrix;
  try {
    inverse = invertMatrix(world);
  } catch {
    return { left: "0px", top: "0px", transformOrigin: "0 0", transform: "none", display: "none" };
  }
  const xs = corners.map((p) => p.x),
    point = transformPoint(inverse, {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: Math.max(...corners.map((p) => p.y)) + 8 / zoom,
    });
  return {
    display: "",
    left: `${point.x}px`,
    top: `${point.y}px`,
    transformOrigin: "0 0",
    transform: `matrix(${inverse[0] / zoom},${inverse[1] / zoom},${inverse[2] / zoom},${inverse[3] / zoom},0,0) translateX(-50%)`,
  };
}
