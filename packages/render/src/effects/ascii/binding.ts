import type { TextureNode, UniformNode } from "three/webgpu";
/** Mutable bindings let character edits reuse the same compiled TSL graph. */
export interface GlyphAtlasBinding {
  readonly texture: TextureNode<"vec4">;
  readonly count: UniformNode<"float", number>;
}
