import type { AnimationChannel } from "../../motion/animations/model";

/** Direct effect behaviors use the same portable channels as authored timeline actions. */
export interface EffectMotionAction {
  name: string;
  channels: AnimationChannel[];
}
export interface EffectMotion {
  automatic?: EffectMotionAction;
  interactive?: EffectMotionAction;
}
