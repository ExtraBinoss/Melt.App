import type { EnginePort } from "@musart/core";
export type EffectSurface = "menu" | "library";
interface EffectSurfaceOwner {
  open: (surface: EffectSurface) => boolean;
  guide: (query: string | null) => void;
}
const owners = new WeakMap<EnginePort, EffectSurfaceOwner>();
/** The mounted layer panel owns opening; requests never synthesize document edits. */
export function registerEffectSurface(
  engine: EnginePort,
  open: (surface: EffectSurface) => boolean,
  guide: (query: string | null) => void,
) {
  const owner = { open, guide };
  owners.set(engine, owner);
  return () => {
    if (owners.get(engine) === owner) owners.delete(engine);
  };
}
export function openEffectSurface(engine: EnginePort, surface: EffectSurface): boolean {
  const owner = owners.get(engine);
  return owner?.open(surface) ?? false;
}

export function acquireEffectGuide(engine: EnginePort, query: string): (() => void) | undefined {
  const owner = owners.get(engine);
  if (!owner) return;
  owner.guide(query);
  return () => {
    if (owners.get(engine) === owner) owner.guide(null);
  };
}
