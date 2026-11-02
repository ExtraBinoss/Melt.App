import type { EnginePort } from "@musart/core";
export type EffectSurface = "menu" | "library";
const owners = new WeakMap<EnginePort, (surface: EffectSurface) => boolean>();
/** The mounted layer panel owns opening; requests never synthesize document edits. */
export function registerEffectSurface(
  engine: EnginePort,
  open: (surface: EffectSurface) => boolean,
) {
  owners.set(engine, open);
  return () => {
    if (owners.get(engine) === open) owners.delete(engine);
  };
}
export function openEffectSurface(engine: EnginePort, surface: EffectSurface): boolean {
  const owner = owners.get(engine);
  return owner?.(surface) ?? false;
}
