import { expect, it } from "vitest";
import { TextureNode } from "three/webgpu";
import { risographNode } from "../../../src/effects/risograph/node";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";

it("connects separate inks, integer seed and authored print coordinates without changing coverage", () => {
  const fixture = nodeFixture("risograph"),
    node = risographNode(fixture),
    graph = graphNodes(node);
  expectSourceAlpha(node, fixture.input);
  for (const [key, control] of Object.entries(fixture.controls.parameters))
    if (!key.startsWith("domain")) expect(graph.has(control)).toBe(true);
  for (const color of Object.values(fixture.controls.colors)) expect(graph.has(color)).toBe(true);
  expect(graph.has(fixture.controls.randomSeedUint)).toBe(true);
  expect(graph.has(fixture.controls.randomSeed)).toBe(false);
  expect(graph.has(fixture.controls.logicalResolution)).toBe(true);
  expect(graph.has(fixture.controls.pixelFootprint)).toBe(false);
  expect(graph.has(fixture.controls.time)).toBe(false);
  // The source binding plus original and three independent ink samples are bounded.
  expect([...graph].filter((entry) => entry instanceof TextureNode).length).toBeLessThanOrEqual(5);
  const key = node.getCacheKey();
  fixture.controls.parameters.palette!.value = 1;
  fixture.controls.parameters.centerX!.value = 0.1;
  fixture.controls.parameters.angle!.value = 180;
  fixture.controls.randomSeedUint.value = 2147483647;
  expect(node.getCacheKey()).toBe(key);
  fixture.dispose();
});
