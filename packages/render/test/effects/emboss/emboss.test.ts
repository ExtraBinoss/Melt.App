import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { TextureNode } from "three/webgpu";
import { embossNode } from "../../../src/effects/emboss/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";

it("uses every emboss control with exact source alpha and a fixed authored-pixel stencil", () => {
  const fixture = nodeFixture("emboss"),
    node = embossNode(fixture),
    graph = graphNodes(node);
  expectSourceAlpha(node, fixture.input);
  for (const [key, parameter] of Object.entries(fixture.controls.parameters))
    if (!key.startsWith("domain")) expect(graph.has(parameter), key).toBe(true);
  expect(graph.has(fixture.controls.colors.materialColor!)).toBe(true);
  expect(graph.has(fixture.controls.amount)).toBe(true);
  expect(graph.has(fixture.controls.logicalResolution)).toBe(true);
  expect(graph.has(fixture.controls.sourceFlipY)).toBe(true);
  for (const control of [
    fixture.controls.time,
    fixture.controls.randomSeed,
    fixture.controls.resolution,
  ])
    expect(graph.has(control)).toBe(false);
  const lookups = [...graph].filter(
    (entry) => entry instanceof TextureNode && entry.value === fixture.input,
  );
  expect(lookups.length).toBeGreaterThanOrEqual(26);
  expect(lookups.length).toBeLessThanOrEqual(27);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});

it("changes all relief modes and material choices through retained uniforms", () => {
  const fixture = nodeFixture("emboss"),
    node = embossNode(fixture),
    cacheKey = node.getCacheKey(),
    modeUniform = fixture.controls.parameters.mode,
    materialUniform = fixture.controls.parameters.material;
  for (const [index, mode] of ["raised", "recessed", "pillow", "outline"].entries()) {
    updateEffectUniforms(
      fixture.controls,
      createEffect("emboss", {
        amount: 0,
        settings: { mode, material: index % 2 ? "source" : "neutral", size: 12, depth: 8 },
      }),
      384,
      216,
      { width: 1920, height: 1080 },
    );
    expect(fixture.controls.parameters.mode).toBe(modeUniform);
    expect(modeUniform!.value).toBe(index);
    expect(fixture.controls.parameters.material).toBe(materialUniform);
    expect(materialUniform!.value).toBe(index % 2 ? 0 : 1);
    expect(fixture.controls.logicalResolution.value.toArray()).toEqual([1920, 1080]);
    expect(fixture.controls.parameters.size!.value).toBe(12);
    expect(fixture.controls.amount.value).toBe(0);
    expect(node.getCacheKey()).toBe(cacheKey);
  }
  fixture.dispose();
});
