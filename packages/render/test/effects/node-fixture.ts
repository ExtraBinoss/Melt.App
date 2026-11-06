import { expect, vi } from "vitest";
import { createEffect, type EffectType } from "@musart/core";
import {
  JoinNode,
  SplitNode,
  Texture,
  TextureNode,
  VarNode,
  NodeBuilder,
  type Node,
} from "three/webgpu";
import { texture } from "three/tsl";
import { createEffectUniforms } from "../../src/effects/shared/uniforms";

export function nodeFixture(type: EffectType) {
  const input = new Texture();
  const atlas = new Texture();
  const controls = createEffectUniforms(createEffect(type), 1920, 1080);
  const source = texture(input);
  const getGlyphAtlas = vi.fn(() => atlas);
  return {
    input,
    atlas,
    controls,
    source,
    backdrop: source,
    getGlyphAtlas,
    dispose: () => {
      input.dispose();
      atlas.dispose();
    },
  };
}
class GraphBuilder extends NodeBuilder {}
export function graphNodes(node: Node): Set<Node> {
  const builder = new GraphBuilder();
  const nodes = new Set<Node>();
  const invoked = new Set<object>();
  const pending = [node];
  while (pending.length) {
    const current = pending.pop()!;
    if (nodes.has(current)) continue;
    nodes.add(current);
    pending.push(...current.getChildren());
    const call = current as Node & {
      isShaderCallNodeInternal?: boolean;
      getOutputNode?: (builder: NodeBuilder) => Node;
      shaderNode?: Node & { layout?: unknown };
      jsFunc?: unknown;
      call?: () => Node;
    };
    // If/Else branches are bare ShaderNodes, unlike parameterized Fn calls.
    if (typeof call.jsFunc === "function" && call.call && !invoked.has(current))
      pending.push(call.call());
    if (call.isShaderCallNodeInternal && call.getOutputNode) {
      // Inspect TSL function dependencies inline; compiling a layout requires an actual renderer.
      const shader = call.shaderNode,
        layout = shader?.layout;
      if (shader) invoked.add(shader);
      try {
        if (shader) shader.layout = null;
        pending.push(call.getOutputNode(builder));
      } finally {
        if (shader) shader.layout = layout;
      }
    }
  }
  return nodes;
}
/** The last component must be the original per-pixel alpha, not a block sample. */
export function expectSourceAlpha(node: Node, input: Texture): void {
  const output = node instanceof VarNode ? node.node : node;
  if (output instanceof TextureNode) {
    expect(output.value).toBe(input);
    return;
  }
  expect(output).toBeInstanceOf(JoinNode);
  if (!(output instanceof JoinNode)) throw new Error("RGBA output expected");
  const alpha = output.nodes[1];
  expect(alpha).toBeInstanceOf(SplitNode);
  if (!(alpha instanceof SplitNode)) throw new Error("Original alpha component expected");
  expect(alpha.components).toBe("w");
  expect(alpha.node).toBeInstanceOf(TextureNode);
  if (!(alpha.node instanceof TextureNode)) throw new Error("Source texture alpha expected");
  expect(alpha.node.value).toBe(input);
}
