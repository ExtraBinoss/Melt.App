import type { Node } from "three/webgpu";
import { dot, floor, fract, mix, sin, vec2 } from "three/tsl";

/** Seeded continuous paper field in authored pixels, shared across viewport/raster changes. */
export function paperNoise(point: Node<"vec2">, seed: Node<"float">) {
  const hash = (p: Node<"vec2">) =>
    fract(sin(dot(p, vec2(127.1, 311.7)).add(seed.mul(0.0137))).mul(43758.5453));
  const cell = floor(point),
    part = fract(point),
    ease = part.mul(part).mul(part.mul(-2).add(3));
  return mix(
    mix(hash(cell), hash(cell.add(vec2(1, 0))), ease.x),
    mix(hash(cell.add(vec2(0, 1))), hash(cell.add(vec2(1, 1))), ease.x),
    ease.y,
  );
}
