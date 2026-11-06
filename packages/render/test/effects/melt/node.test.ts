import { expect, test } from "vitest";
import { createEffect } from "@musart/core";
import { MathNode, TextureNode } from "three/webgpu";
import { meltNode } from "../../../src/effects/melt/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { graphNodes, nodeFixture } from "../node-fixture";

test("melt uses a finite alpha-aware source graph and exact seed without clock feedback", () => {
  const fixture = nodeFixture("melt"),
    graph = graphNodes(meltNode(fixture));
  for (const [key, control] of Object.entries(fixture.controls.parameters))
    if (!key.startsWith("domain")) expect(graph.has(control)).toBe(true);
  for (const control of [
    fixture.controls.amount,
    fixture.controls.logicalResolution,
    fixture.controls.contentOrigin,
    fixture.controls.contentResolution,
    fixture.controls.randomSeedUint,
    fixture.controls.resolution,
    fixture.controls.sourceFlipY,
  ])
    expect(graph.has(control)).toBe(true);
  expect(graph.has(fixture.controls.randomSeed)).toBe(false);
  expect(graph.has(fixture.controls.time)).toBe(false);
  const lookups = [...graph].filter(
    (entry) => entry instanceof TextureNode && entry.value === fixture.input,
  );
  // Five four-texel premultiplied gathers and the unchanged source, plus its binding.
  expect(lookups.length).toBeGreaterThanOrEqual(21);
  expect(lookups.length).toBeLessThanOrEqual(22);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});

test("melt keeps all authoring uniforms stable through phase, padding and density changes", () => {
  const fixture = nodeFixture("melt"),
    output = meltNode(fixture),
    cacheKey = output.getCacheKey(),
    identities = { ...fixture.controls.parameters };
  updateEffectUniforms(
    fixture.controls,
    createEffect("melt", {
      amount: 0,
      seed: 2147483647,
      settings: { distance: 512, angle: -90, phase: 360, tone: "shadows" },
    }),
    500,
    400,
    { width: 1000, height: 800, content: { x: 100, y: 80, width: 700, height: 600 } },
  );
  expect(output.getCacheKey()).toBe(cacheKey);
  for (const [key, control] of Object.entries(identities))
    expect(fixture.controls.parameters[key]).toBe(control);
  expect(fixture.controls.parameters.phase!.value).toBe(360);
  expect(fixture.controls.parameters.tone!.value).toBe(1);
  expect(fixture.controls.randomSeedUint.value).toBe(2147483647);
  expect(fixture.controls.contentOrigin.value.toArray()).toEqual([100, 120]);
  expect(fixture.controls.contentResolution.value.toArray()).toEqual([700, 600]);
  expect(fixture.controls.logicalResolution.value.toArray()).toEqual([1000, 800]);
  const reductions = [...graphNodes(output)].filter(
    (node) => node instanceof MathNode && node.method === "fract",
  );
  expect(
    reductions.some((node) => {
      const branch = graphNodes(node);
      return branch.has(identities.phase!) && !branch.has(fixture.controls.logicalResolution);
    }),
  ).toBe(true);
  fixture.dispose();
});
