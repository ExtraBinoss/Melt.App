import { expect, it } from "vitest";
import { TextureNode } from "three/webgpu";
import { shapeGridNode } from "../../../src/effects/shape-grid/node";
import { watercolorNode } from "../../../src/effects/watercolor/node";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";

it("reconstructs a tone-driven shape grid with a fixed alpha-weighted stencil and stable controls", () => {
  const fixture = nodeFixture("shape-grid"),
    node = shapeGridNode(fixture),
    graph = graphNodes(node);
  for (const [key, control] of Object.entries(fixture.controls.parameters))
    if (!key.startsWith("domain")) expect(graph.has(control), key).toBe(true);
  for (const color of Object.values(fixture.controls.colors)) expect(graph.has(color)).toBe(true);
  expect(graph.has(fixture.controls.logicalResolution)).toBe(true);
  expect(graph.has(fixture.controls.contentOrigin)).toBe(true);
  expect(graph.has(fixture.controls.contentResolution)).toBe(true);
  expect(graph.has(fixture.controls.time)).toBe(false);
  const samples = [...graph].filter((n) => n instanceof TextureNode);
  expect(samples.length).toBeGreaterThanOrEqual(21);
  expect(samples.length).toBeLessThanOrEqual(22);
  const key = node.getCacheKey();
  fixture.controls.parameters.cellSize!.value = 120;
  fixture.controls.parameters.shape!.value = 5;
  fixture.controls.parameters.backgroundOpacity!.value = 1;
  fixture.controls.amount.value = 0;
  expect(node.getCacheKey()).toBe(key);
  fixture.dispose();
});

it("keeps watercolor alpha exact and uses bounded seeded owner-space pigment sampling", () => {
  const fixture = nodeFixture("watercolor"),
    node = watercolorNode(fixture),
    graph = graphNodes(node);
  expectSourceAlpha(node, fixture.input);
  for (const [key, control] of Object.entries(fixture.controls.parameters))
    if (!key.startsWith("domain")) expect(graph.has(control), key).toBe(true);
  expect(graph.has(fixture.controls.randomSeed)).toBe(true);
  expect(graph.has(fixture.controls.contentOrigin)).toBe(true);
  expect(graph.has(fixture.controls.contentResolution)).toBe(true);
  expect(graph.has(fixture.controls.logicalResolution)).toBe(true);
  expect(graph.has(fixture.controls.time)).toBe(false);
  expect(graph.has(fixture.controls.resolution)).toBe(true);
  const samples = [...graph].filter((n) => n instanceof TextureNode);
  expect(samples.length).toBeGreaterThanOrEqual(101);
  expect(samples.length).toBeLessThanOrEqual(102);
  const key = node.getCacheKey();
  fixture.controls.parameters.washScale!.value = 18;
  fixture.controls.parameters.paperOpacity!.value = 0;
  fixture.controls.randomSeed.value = 1337;
  expect(node.getCacheKey()).toBe(key);
  fixture.dispose();
});
