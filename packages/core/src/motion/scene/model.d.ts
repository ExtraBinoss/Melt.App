import type { MotionKeyframe } from "../model";
import type {
  EffectMotionProperty,
  MotionPropertyDescriptor,
  MotionValue,
} from "../properties/model";
import type { SpatialLight, SpatialScene } from "../../spatial/model";
export type CameraMotionProperty = keyof SpatialScene["camera"];
export type EnvironmentMotionProperty = "intensity" | "rotation";
export type LightMotionProperty = Exclude<keyof SpatialLight, "id">;
/** Durable composition and light IDs, never layer IDs or array indexes. */
export type SceneMotionPropertyTarget =
  | {
      readonly kind: "compositionEffect";
      readonly compositionId: string;
      readonly effectId: string;
      readonly property: EffectMotionProperty;
    }
  | {
      readonly kind: "compositionEffectSetting";
      readonly compositionId: string;
      readonly effectId: string;
      readonly property: string;
    }
  | {
      readonly kind: "camera";
      readonly compositionId: string;
      readonly property: CameraMotionProperty;
    }
  | {
      readonly kind: "environment";
      readonly compositionId: string;
      readonly property: EnvironmentMotionProperty;
    }
  | {
      readonly kind: "light";
      readonly compositionId: string;
      readonly lightId: string;
      readonly property: LightMotionProperty;
    };
type ReplaceTarget<T> = T extends unknown
  ? Omit<T, "target"> & { readonly target: SceneMotionPropertyTarget }
  : never;
export type SceneMotionPropertyDescriptor = ReplaceTarget<MotionPropertyDescriptor>;
export interface SceneMotionPropertyTrack {
  id: string;
  target: SceneMotionPropertyTarget;
  keyframes: MotionKeyframe[];
}
export interface SceneMotionFrameValue {
  readonly target: SceneMotionPropertyTarget;
  readonly value: MotionValue;
}
