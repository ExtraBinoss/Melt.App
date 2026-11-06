import type { Node, Texture, TextureNode, UniformNode, Matrix3 } from "three/webgpu";
import type { Bounds, Effect } from "@musart/core";
import type { EffectUniforms } from "./uniforms";
import type { GlyphAtlasBinding } from "../ascii/binding";

/** Borrowed native inputs; their renderer owner retains allocation and disposal. */
export interface EffectHistoryInput {
  readonly texture: Texture;
  readonly available: boolean;
  readonly flipY: boolean;
  /** Historical color is captured in composition coordinates, not the current object pose. */
  readonly captureBounds?: Bounds;
  readonly ownerBounds?: Bounds;
  /** Current effect UV to historical canonical bottom-up UV. */
  readonly uvTransform?: readonly number[];
}
export interface EffectDepthInput {
  readonly texture: Texture;
  readonly near: number;
  readonly far: number;
  readonly perspective: boolean;
  /** Effect UV (bottom up) to the exact native depth viewport UV (top down). */
  readonly uvTransform?: readonly number[];
  readonly focusTexture?: Texture;
}
export interface EffectAuxiliaryInputs {
  readonly scope?: "layer" | "composition";
  readonly depth?: EffectDepthInput;
  readonly depthForEffect?: (effect: Effect) => EffectDepthInput | undefined;
  readonly history?: ReadonlyMap<string, readonly EffectHistoryInput[]>;
}
export interface EffectDepthBinding {
  readonly texture: TextureNode<"vec4">;
  readonly available: UniformNode<"float", number>;
  readonly near: UniformNode<"float", number>;
  readonly far: UniformNode<"float", number>;
  readonly perspective: UniformNode<"float", number>;
  readonly uvTransform: UniformNode<"mat3", Matrix3>;
  readonly focusTexture: TextureNode<"vec4">;
  readonly focusPresent: UniformNode<"float", number>;
}
export interface EffectHistoryBinding {
  readonly texture: TextureNode<"vec4">;
  readonly available: UniformNode<"float", number>;
  readonly flipY: UniformNode<"float", number>;
  readonly uvTransform: UniformNode<"mat3", Matrix3>;
}

/** GPU-only inputs. Source pixels and intermediate results never cross this boundary. */
export interface EffectNodeContext {
  readonly source: TextureNode<"vec4">;
  readonly bindImageInput?: (key: string) => {
    readonly texture: TextureNode<"vec4">;
    readonly enabled: UniformNode<"float", number>;
    readonly flipY?: UniformNode<"float", number>;
  };
  readonly bindDepthInput?: () => EffectDepthBinding;
  readonly bindHistoryInput?: (slot: number) => EffectHistoryBinding;
  readonly backdrop?: TextureNode<"vec4">;
  readonly controls: EffectUniforms;
  readonly getGlyphAtlas: () => Texture;
  readonly bindGlyphAtlas?: () => GlyphAtlasBinding;
}
export type EffectNodeBuilder = (context: EffectNodeContext) => Node<"vec4">;
/** Authored layer dimensions, independent of its current raster density. */
export interface EffectDimensions {
  readonly width: number;
  readonly height: number;
  /** Original content rectangle within an expanded effect transport surface, in document pixels. */
  readonly content?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

import { mix, vec2 } from "three/tsl";
/** UV1 is the logical image top; WebGPU framebuffer textures store their top at UV0. */
export function sampleEffect(
  source: TextureNode<"vec4">,
  controls: EffectUniforms,
  coord: Node<"vec2">,
) {
  return source.sample(vec2(coord.x, mix(coord.y, coord.y.oneMinus(), controls.sourceFlipY)));
}
