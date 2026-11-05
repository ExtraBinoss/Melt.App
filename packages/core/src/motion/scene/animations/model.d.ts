import type { EffectMotionProperty } from "../../properties/model";
import type { MotionAnimation, MotionAnimationPreset } from "../../animations/model";
import type {
  CameraMotionProperty,
  EnvironmentMotionProperty,
  LightMotionProperty,
} from "../model";
export type SceneAnimationOwner =
  | {
      readonly kind: "compositionEffect";
      readonly compositionId: string;
      readonly effectId: string;
    }
  | { readonly kind: "camera"; readonly compositionId: string }
  | { readonly kind: "environment"; readonly compositionId: string }
  | { readonly kind: "light"; readonly compositionId: string; readonly lightId: string };
/** A reusable channel binds through its real owner, without embedding project/light identities. */
export type SceneAnimationTarget =
  | { readonly kind: "compositionEffect"; readonly property: EffectMotionProperty }
  | { readonly kind: "compositionEffectSetting"; readonly property: string }
  | { readonly kind: "camera"; readonly property: CameraMotionProperty }
  | { readonly kind: "environment"; readonly property: EnvironmentMotionProperty }
  | { readonly kind: "light"; readonly property: LightMotionProperty };
export type SceneMotionAnimationPreset = MotionAnimationPreset<SceneAnimationTarget>;
export interface SceneMotionAnimation extends MotionAnimation<SceneAnimationTarget> {
  owner: SceneAnimationOwner;
}
