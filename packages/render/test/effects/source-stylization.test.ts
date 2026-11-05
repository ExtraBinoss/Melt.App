import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { MathNode, TextureNode } from "three/webgpu";
import { blocksNode } from "../../src/effects/blocks/node";
import { chromaticAberrationNode } from "../../src/effects/chromatic-aberration/node";
import { windNode } from "../../src/effects/wind/node";
import { updateEffectUniforms } from "../../src/effects/shared/uniforms";
import { expectSourceAlpha, graphNodes, nodeFixture } from "./node-fixture";

const treatments = [
  { type: "blocks", builder: blocksNode, samples: 6, seeded: true },
  { type: "chromatic-aberration", builder: chromaticAberrationNode, samples: 3, seeded: false },
  { type: "wind", builder: windNode, samples: 13, seeded: true },
] as const;

it.each(treatments)(
  "$type wires every control to a bounded source graph",
  ({ type, builder, samples, seeded }) => {
    const fixture = nodeFixture(type),
      node = builder(fixture),
      graph = graphNodes(node);
    if (type !== "blocks") expectSourceAlpha(node, fixture.input);
    for (const [key, parameter] of Object.entries(fixture.controls.parameters))
      if (!key.startsWith("domain")) expect(graph.has(parameter)).toBe(true);
    for (const control of [
      fixture.controls.logicalResolution,
      fixture.controls.sourceFlipY,
      fixture.controls.amount,
    ])
      expect(graph.has(control)).toBe(true);
    expect(graph.has(fixture.controls.randomSeedUint)).toBe(seeded);
    expect(graph.has(fixture.controls.randomSeed)).toBe(false);
    expect(graph.has(fixture.controls.time)).toBe(type === "wind");
    expect(graph.has(fixture.controls.resolution)).toBe(false);
    expect(graph.has(fixture.controls.pixelFootprint)).toBe(type === "blocks");
    const lookups = [...graph].filter(
      (entry) => entry instanceof TextureNode && entry.value === fixture.input,
    );
    // Include the shared source reference itself if Three exposes it as a child.
    expect(lookups.length).toBeLessThanOrEqual(samples + 1);
    expect(lookups.length).toBeGreaterThanOrEqual(samples);
    expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
    fixture.dispose();
  },
);

it.each(treatments)(
  "$type mutates parameter uniforms in place across preview density changes",
  ({ type, builder }) => {
    const fixture = nodeFixture(type),
      node = builder(fixture),
      graph = graphNodes(node),
      identities = { ...fixture.controls.parameters };
    updateEffectUniforms(
      fixture.controls,
      createEffect(type, {
        seed: 2147483647,
        ...(type === "wind" ? { time: 86400 } : {}),
        settings: { centerX: 0.2, centerY: 0.7, angle: 90 },
      }),
      384,
      216,
      { width: 1920, height: 1080 },
    );
    for (const [key, parameter] of Object.entries(identities)) {
      expect(fixture.controls.parameters[key]).toBe(parameter);
      if (!key.startsWith("domain")) expect(graph.has(parameter)).toBe(true);
    }
    expect(fixture.controls.parameters.centerX!.value).toBe(0.2);
    expect(fixture.controls.parameters.centerY!.value).toBe(0.7);
    expect(fixture.controls.parameters.angle!.value).toBe(90);
    expect(fixture.controls.logicalResolution.value.toArray()).toEqual([1920, 1080]);
    expect(fixture.controls.randomSeedUint.value).toBe(2147483647);
    fixture.dispose();
  },
);

it("wind reduces spatial and temporal cycles independently before gust combination", () => {
  const fixture = nodeFixture("wind"),
    graph = graphNodes(windNode(fixture)),
    reductions = [...graph].filter((node) => node instanceof MathNode && node.method === "fract"),
    spatial = reductions.find((node) => {
      const branch = graphNodes(node);
      return branch.has(fixture.controls.logicalResolution) && !branch.has(fixture.controls.time);
    }),
    temporal = reductions.find((node) => {
      const branch = graphNodes(node);
      return branch.has(fixture.controls.time) && !branch.has(fixture.controls.logicalResolution);
    });
  expect(spatial).toBeDefined();
  expect(temporal).toBeDefined();
  expect(graphNodes(temporal!).has(fixture.controls.parameters.speed!)).toBe(true);
  expect(
    reductions.some((node) => {
      const branch = graphNodes(node);
      return branch.has(spatial!) && branch.has(temporal!);
    }),
  ).toBe(true);
  fixture.dispose();
});
