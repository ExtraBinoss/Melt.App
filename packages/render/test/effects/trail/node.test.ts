import { expect, it } from "vitest";
import { Matrix3, Texture, TextureNode } from "three/webgpu";
import { texture, uniform } from "three/tsl";
import { trailNode } from "../../../src/effects/trail/node";
import { graphNodes, nodeFixture } from "../node-fixture";

it("samples each historical texture through its retained projective mapping and availability", () => {
  const fixture = nodeFixture("trail"),
    bindings = Array.from({ length: 8 }, () => ({
      texture: texture(new Texture()),
      available: uniform(1),
      flipY: uniform(1),
      uvTransform: uniform(new Matrix3()),
    })),
    graph = graphNodes(trailNode({ ...fixture, bindHistoryInput: (slot) => bindings[slot]! }));
  for (const binding of bindings) {
    const lookups = [...graph].filter(
      (node) => node instanceof TextureNode && node.value === binding.texture.value,
    );
    expect(lookups.length).toBeGreaterThan(0);
    expect(graph.has(binding.available)).toBe(true);
    expect(graph.has(binding.flipY)).toBe(true);
    expect(graph.has(binding.uvTransform)).toBe(true);
    // Mapping uniforms feed the texture lookup itself, rather than only an availability branch.
    expect(lookups.some((lookup) => graphNodes(lookup).has(binding.uvTransform))).toBe(true);
    binding.texture.value.dispose();
  }
  fixture.dispose();
});
