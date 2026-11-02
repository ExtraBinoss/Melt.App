import { profileFromPolygon } from "./engine/shape";
import { BotEngine } from "./engine/engine";
import type { StateId } from "./engine/bot-types";
import { EXPRESSION_BY_ID } from "./engine/expressions";
import { SHAPE_BY_ID } from "./engine/skins";
import { RAYON } from "./engine/repere";
import { brand } from "./config";

export type BrandState = "idle" | "loading" | "preparing" | "working";
export const brandStates = {
  idle: "idle",
  working: "idle",
  loading: "thinking",
  preparing: "orbit",
} as const satisfies Record<BrandState, StateId>;
/** Maskot's genuine Dahlia profile and wide-eyed expression, with its original morph engine. */
export function createDahliaEngine(state: StateId = "idle"): BotEngine {
  const engine = new BotEngine(
    RAYON,
    state,
    SHAPE_BY_ID.get(brand.mascot.shape)!.radii,
    EXPRESSION_BY_ID.get(brand.mascot.expression)!,
  );
  engine.setEyes(brand.mascot.eyes, -1);
  return engine;
}

export type MascotShape = "mascot" | "pointer";
const pointerProfile = profileFromPolygon(
  [
    { x: -0.9, y: -0.85 },
    { x: 1.12, y: 0 },
    { x: -0.9, y: 0.85 },
    { x: -0.48, y: 0 },
  ],
  0,
  0,
);
export function mascotShape(shape: MascotShape): number[] {
  return shape === "pointer" ? pointerProfile : SHAPE_BY_ID.get(brand.mascot.shape)!.radii;
}
