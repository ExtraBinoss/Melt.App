import { expect, it } from "vitest";
import { TextureNode } from "three/webgpu";
import { oilPaintNode } from "../../../src/effects/oil-paint/node";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";

it("uses a bounded shared stencil and keeps brush, edge and detail edits on stable uniforms", () => {
  const fixture = nodeFixture("oil-paint"),
    node = oilPaintNode(fixture),
    graph = graphNodes(node);
  expectSourceAlpha(node, fixture.input);
  for (const [key, control] of Object.entries(fixture.controls.parameters))
    if (!key.startsWith("domain")) expect(graph.has(control)).toBe(true);
  expect(graph.has(fixture.controls.logicalResolution)).toBe(true);
  expect(graph.has(fixture.controls.pixelFootprint)).toBe(false);
  expect(graph.has(fixture.controls.resolution)).toBe(false);
  expect(graph.has(fixture.controls.time)).toBe(false);
  expect(graph.has(fixture.controls.randomSeed)).toBe(false);
  // Twenty-five positions plus the source binding, independent of brush radius.
  const textures = [...graph].filter((entry) => entry instanceof TextureNode);
  expect(textures.length).toBeGreaterThanOrEqual(25);
  expect(textures.length).toBeLessThanOrEqual(26);
  const key = node.getCacheKey();
  fixture.controls.parameters.brushScale!.value = 32;
  fixture.controls.parameters.elongation!.value = 4;
  fixture.controls.parameters.detail!.value = 1;
  expect(node.getCacheKey()).toBe(key);
  fixture.dispose();
});
