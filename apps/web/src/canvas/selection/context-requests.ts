import type { EnginePort } from "@musart/core";
import type { Point } from "../viewport/view";
const owners = new WeakMap<EnginePort, (point: Point) => void>();
export function registerCanvasMenu(engine: EnginePort, open: (point: Point) => void) {
  owners.set(engine, open);
  return () => {
    if (owners.get(engine) === open) owners.delete(engine);
  };
}
export function requestCanvasMenu(engine: EnginePort, point: Point) {
  const open = owners.get(engine);
  open?.(point);
  return !!open;
}
