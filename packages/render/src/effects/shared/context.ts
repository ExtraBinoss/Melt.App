import type { Node, Texture, TextureNode, UniformNode } from "three/webgpu";
import type { EffectUniforms } from "./uniforms";
import type { GlyphAtlasBinding } from "../ascii/binding";

/** GPU-only inputs. Source pixels and intermediate results never cross this boundary. */
export interface EffectNodeContext {
  readonly source: TextureNode<"vec4">;
  readonly temporal?: {
    readonly source: TextureNode<"vec4">;
    readonly flipY: UniformNode<"float", number>;
    readonly enabled: UniformNode<"float", number>;
    readonly region: UniformNode<"vec4", import("three/webgpu").Vector4>;
    readonly phase: UniformNode<"float", number>;
  };
  readonly bindImageInput?: (key: string) => {
    readonly texture: TextureNode<"vec4">;
    readonly enabled: UniformNode<"float", number>;
  };
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
  readonly origin?: { readonly x: number; readonly y: number };
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
