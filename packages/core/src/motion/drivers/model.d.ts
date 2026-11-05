import type { MotionTime } from "../time";

/** Semantic input, relative to the action start. Never sampled document keyframes. */
export type MotionInputEvent =
  | {
      readonly kind: "pointer";
      readonly at: MotionTime;
      readonly x: number;
      readonly y: number;
      readonly dragging: boolean;
    }
  | { readonly kind: "primaryClick" | "secondaryClick"; readonly at: MotionTime };

export type MotionInputKind =
  | "pointerX"
  | "pointerY"
  | "pointerXY"
  | "pointerDrag"
  | "primaryClick"
  | "secondaryClick";
export interface MotionSpringResponse {
  /** Natural angular frequency in radians/second. */
  readonly frequency: number;
  readonly damping: number;
}
export type MotionDriver =
  | { readonly kind: "loop" | "pingPong" | "pulse"; readonly period: MotionTime }
  | {
      readonly kind: MotionInputKind;
      /** Both axes bind independently through the ordinary typed channel map. */
      readonly axis?: "x" | "y";
      readonly initial: number;
      readonly response?: MotionSpringResponse;
      /** Drag release returns to the neutral value through the authored response. */
      readonly returnOnRelease?: boolean;
      readonly clickMode?: "toggle" | "impulse";
      readonly impulseDuration?: MotionTime;
      readonly events: readonly MotionInputEvent[];
    };
