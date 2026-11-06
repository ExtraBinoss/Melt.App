import { expect, it } from "vitest";
import { TextureNode } from "three/webgpu";
import { waxNode } from "../../../src/effects/wax/node";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";

it("preserves Wax alpha and binds every coating control to a bounded source-aware graph", () => {
  const fixture = nodeFixture("wax"),
    node = waxNode(fixture),
    graph = graphNodes(node);
  expectSourceAlpha(node, fixture.input);
  for (const [key, control] of Object.entries(fixture.controls.parameters))
    if (!key.startsWith("domain")) expect(graph.has(control), key).toBe(true);
  expect(graph.has(fixture.controls.colors.waxColor!)).toBe(true);
  expect(graph.has(fixture.controls.amount)).toBe(true);
  expect(graph.has(fixture.controls.logicalResolution)).toBe(true);
  expect(graph.has(fixture.controls.resolution)).toBe(true);
  expect(graph.has(fixture.controls.sourceFlipY)).toBe(true);
  expect(graph.has(fixture.controls.time)).toBe(false);
  expect(graph.has(fixture.controls.randomSeed)).toBe(false);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  const samples = [...graph].filter((entry) => entry instanceof TextureNode);
  expect(samples.length).toBeGreaterThanOrEqual(101);
  expect(samples.length).toBeLessThanOrEqual(102);
  fixture.dispose();
});

it("retains the Wax graph across radius, lighting and zero-amount preview updates", () => {
  const fixture = nodeFixture("wax"),
    node = waxNode(fixture),
    key = node.getCacheKey();
  fixture.controls.parameters.blur!.value = 20;
  fixture.controls.parameters.lightAngle!.value = 90;
  fixture.controls.parameters.relief!.value = 4;
  fixture.controls.parameters.translucence!.value = 0;
  fixture.controls.amount.value = 0;
  expect(node.getCacheKey()).toBe(key);
  expectSourceAlpha(node, fixture.input);
  fixture.dispose();
});
