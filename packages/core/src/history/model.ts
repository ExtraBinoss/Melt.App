import type { Command, EffectType } from "../document/model";
import type { LayerMotionProperty, EffectMotionProperty } from "../motion/properties/model";
import type {
  CameraMotionProperty,
  LightMotionProperty,
  EnvironmentMotionProperty,
} from "../motion/scene/model";

export type HistoryValue =
  | {
      readonly kind: "scalar";
      readonly value: number | boolean | string;
      readonly truncated?: true;
    }
  | { readonly kind: "mixed" }
  | { readonly kind: "missing" };
export type HistoryOwner =
  | { readonly kind: "project"; readonly projectId: string }
  | { readonly kind: "composition"; readonly compositionId: string }
  | { readonly kind: "layer"; readonly compositionId: string; readonly layerId: string }
  | {
      readonly kind: "effect";
      readonly compositionId: string;
      readonly layerId: string;
      readonly effectId: string;
      readonly effectType: EffectType;
    }
  | { readonly kind: "camera"; readonly compositionId: string }
  | { readonly kind: "environment"; readonly compositionId: string }
  | { readonly kind: "light"; readonly compositionId: string; readonly lightId: string }
  | { readonly kind: "audio"; readonly compositionId: string; readonly trackId: string }
  | {
      readonly kind: "motion";
      readonly compositionId: string;
      readonly entity: "composition" | "occurrence" | "keyframe" | "animation" | "transition";
      readonly trackId?: string;
      readonly keyframeId?: string;
      readonly animationId?: string;
    }
  | { readonly kind: "guide"; readonly compositionId: string; readonly guideId: string }
  | { readonly kind: "mask"; readonly compositionId: string; readonly layerId: string }
  | { readonly kind: "asset"; readonly projectId: string };
type Owner<K extends HistoryOwner["kind"]> = Extract<HistoryOwner, { kind: K }>;
type Target<K extends HistoryOwner["kind"], P extends string> = {
  readonly owner: Owner<K>;
  readonly property: P;
};
export type LayerHistoryProperty =
  | `fillGradient.${"centerX" | "centerY" | "radius" | "radialShape"}`
  | LayerMotionProperty
  | "name"
  | "locked"
  | "parentId"
  | "assetId"
  | "maskSource"
  | "spatialContext"
  | "vector.preserveColors"
  | "vector.strokeOnly"
  | `affine.${0 | 1 | 2 | 3}`
  | `${"margin" | "padding"}.${"top" | "right" | "bottom" | "left"}`
  | "spatial.enabled"
  | "spatial.source"
  | "spatial.castShadow"
  | "spatial.receiveShadow"
  | "spatial.useModelMaterials"
  | "spatial.material.preset";
export type CompositionHistoryProperty =
  | "name"
  | "width"
  | "height"
  | "background"
  | "backgroundGradient.kind"
  | "backgroundGradient.angle"
  | `backgroundGradient.${"centerX" | "centerY" | "radius" | "radialShape"}`
  | `backgroundGradient.stops.${number}.${"color" | "offset"}`
  | "rulers"
  | "colorSpace"
  | `margins.${"top" | "right" | "bottom" | "left"}`
  | `canvasPosition.${"x" | "y"}`
  | "shadows"
  | "reflections.mode"
  | "reflections.quality";
export type AudioHistoryProperty =
  | "name"
  | "mute"
  | "volume"
  | "start"
  | "end"
  | "sourceIn"
  | "fadeIn"
  | "fadeOut"
  | "reverb.mix"
  | "reverb.decay";
export type MotionHistoryProperty =
  | "mode"
  | "duration"
  | "start"
  | "end"
  | "sourceIn"
  | "playbackRate"
  | "loop"
  | "mute"
  | "volume"
  | "time"
  | "value"
  | "easing"
  | "easing.x1"
  | "easing.y1"
  | "easing.x2"
  | "easing.y2"
  | "easing.bounce"
  | "easing.response"
  | "strength"
  | "enabled"
  | "preset";
export type HistoryPropertyTarget =
  | Target<"project", "name">
  | Target<"composition", CompositionHistoryProperty>
  | Target<"layer", LayerHistoryProperty>
  | Target<"effect", EffectMotionProperty | `settings.${string}` | `inputs.${string}`>
  | Target<"camera", CameraMotionProperty>
  | Target<"environment", EnvironmentMotionProperty | "preset" | "assetId">
  | Target<"light", LightMotionProperty>
  | Target<"audio", AudioHistoryProperty>
  | Target<"motion", MotionHistoryProperty>
  | Target<"guide", "axis" | "position" | "color">
  | Target<"mask", "enabled" | "inverted" | "mode" | "layerId">;
export type HistoryAction =
  | "add"
  | "delete"
  | "duplicate"
  | "reorder"
  | "group"
  | "ungroup"
  | "align"
  | "distribute"
  | "geometry"
  | "spatialTransform"
  | "gradientStops"
  | "applyTransition"
  | "animationChannels"
  | "assets"
  | "replay";
export interface HistoryPropertyChange {
  readonly kind: "property";
  readonly target: HistoryPropertyTarget;
  readonly before: HistoryValue;
  readonly after: HistoryValue;
  readonly context?: "keyframe" | "animation";
  /** Keyed locations distinguish independent values of the same property. */
  readonly at?: number;
  readonly trackId?: string;
}
export interface HistoryStructuralAction {
  readonly kind: "action";
  readonly action: HistoryAction;
  readonly owner: HistoryOwner;
}
export type HistoryChange = HistoryPropertyChange | HistoryStructuralAction;
export interface HistoryDescription {
  readonly changes: readonly HistoryChange[];
  readonly additionalChanges: boolean;
}
export interface HistoryPropertyDefinition {
  readonly kind: "number" | "boolean" | "string" | "color" | "choice";
  readonly displayScale?: number;
  readonly unit?: "px" | "°" | "%" | "s";
  readonly options?: readonly string[];
  readonly choiceLabels?: readonly { readonly value: string; readonly labelKey: string }[];
  readonly label: {
    readonly source:
      | "layer"
      | "spatial"
      | "scene"
      | "composition"
      | "audio"
      | "motion"
      | "effect"
      | "guide"
      | "mask"
      | "project";
    readonly property: string;
    readonly effectType?: EffectType;
    readonly scope?: "root" | "settings" | "input";
    readonly key?: string;
  };
}
/** Every portable command must declare its domain collector. */
export type HistoryCommandKind = Command["type"];
