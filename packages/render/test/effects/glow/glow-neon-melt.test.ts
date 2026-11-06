import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { Texture, TextureNode } from "three/webgpu";
import { texture } from "three/tsl";
import {
  GLOW_PARTITIONS,
  GLOW_PREFILTER_TAPS,
  GLOW_TAPS,
  glowPartitionCount,
} from "../../../src/effects/glow/kernel";
import { glowStages } from "../../../src/effects/glow/pipeline";
import { glowFootprint } from "../../../src/effects/glow/footprint";
import { neonMeltStages } from "../../../src/effects/neon-melt/pipeline";
import { neonMeltFootprint } from "../../../src/effects/neon-melt/footprint";
import { glowNode } from "../../../src/effects/glow/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { graphNodes, nodeFixture } from "../node-fixture";

it("conserves energy with a symmetric, finite multiscale halo of bounded support", () => {
  expect(GLOW_TAPS).toHaveLength(9);
  expect(GLOW_PREFILTER_TAPS).toHaveLength(9);
  expect(GLOW_TAPS.reduce((sum, tap) => sum + tap.weight, 0)).toBeCloseTo(1, 12);
  expect(GLOW_TAPS.reduce((sum, tap) => sum + tap.offset * tap.weight, 0)).toBeCloseTo(0, 12);
  expect(GLOW_TAPS.every((tap) => tap.weight > 0 && Math.abs(tap.offset) <= 1)).toBe(true);
  expect(new Set(GLOW_TAPS.map((tap) => Math.abs(tap.offset))).size).toBe(5);
});

it("connects highlight selection, retained original, premultiplied filters and every visible control", () => {
  for (const type of ["glow", "neon-melt"] as const) {
    const fixture = nodeFixture(type),
      original = new Texture(),
      context = { ...fixture, backdrop: texture(original) },
      stages =
        type === "glow" ? glowStages(createEffect(type)) : neonMeltStages(createEffect(type)),
      graph = new Set(stages.flatMap((stage) => [...graphNodes(stage.builder(context))]));
    expect(stages).toHaveLength(type === "glow" ? 6 : 7);
    expect(stages.slice(0, -1).every((stage) => !stage.final)).toBe(true);
    expect(stages.at(-1)!.final).toBe(true);
    expect(stages.every((stage) => stage.key.startsWith(type + ":"))).toBe(true);
    for (const [key, uniform] of Object.entries(fixture.controls.parameters))
      if (!key.startsWith("domain")) expect(graph.has(uniform), `${type}.${key}`).toBe(true);
    expect(graph.has(fixture.controls.colors.tint!)).toBe(true);
    expect(graph.has(fixture.controls.amount)).toBe(true);
    expect(graph.has(fixture.controls.logicalResolution)).toBe(true);
    expect(graph.has(fixture.controls.time)).toBe(false);
    const finalGraph = graphNodes(stages.at(-1)!.builder(context));
    const inputs = [...finalGraph].filter(
      (node): node is TextureNode => node instanceof TextureNode,
    );
    expect(inputs.some((node) => node.value === fixture.input)).toBe(true);
    expect(inputs.some((node) => node.value === original)).toBe(true);
    if (type === "neon-melt") {
      expect(graph.has(fixture.controls.contentOrigin)).toBe(true);
      expect(graph.has(fixture.controls.contentResolution)).toBe(true);
    }
    original.dispose();
    fixture.dispose();
  }
  const fixture = nodeFixture("glow");
  expect(() => glowNode({ ...fixture, backdrop: undefined })).toThrow("preserved original");
  fixture.dispose();
});

it("keeps animated transports stable at zero amount and updates controls without rebuilding them", () => {
  for (const type of ["glow", "neon-melt"] as const) {
    const fixture = nodeFixture(type),
      uniforms = { ...fixture.controls.parameters },
      footprint = type === "glow" ? glowFootprint : neonMeltFootprint,
      settings = type === "glow" ? { radius: 64 } : { radius: 64, distortion: 32 },
      expected = footprint(createEffect(type, { settings }));
    for (const amount of [0, 0.5, 1]) {
      const effect = createEffect(type, { amount, settings });
      updateEffectUniforms(fixture.controls, effect, 320, 240, {
        width: 640,
        height: 480,
        content: { x: 64, y: 64, width: 512, height: 352 },
      });
      expect(footprint(effect)).toEqual(expected);
      for (const [key, uniform] of Object.entries(uniforms))
        expect(fixture.controls.parameters[key]).toBe(uniform);
      expect(uniforms.radius!.value).toBe(64);
    }
    expect(expected.left).toBe(type === "glow" ? 65 : Math.ceil(64 + 32 * Math.SQRT2) + 2);
    fixture.dispose();
  }
});

it("prefilters before coarse sampling, partitions exact halo support and isolates graph cache variants", () => {
  const variants = new Set<string>();
  for (const radius of [0, 4, 4.001, 16, 16.001, 64, 64.001, 256]) {
    const count = glowPartitionCount(radius),
      stages = glowStages(createEffect("glow", { settings: { radius } }));
    expect(stages).toHaveLength(count * 2);
    expect(
      GLOW_PARTITIONS.slice(0, count).reduce(
        (sum, part) => sum + Math.min(part.capacity, Math.max(0, radius - part.start)),
        0,
      ),
    ).toBeCloseTo(radius, 12);
    const key = stages.map((stage) => stage.key).join(",");
    if (variants.size < count) {
      expect(variants.has(key)).toBe(false);
      variants.add(key);
    }
    for (const [index, part] of GLOW_PARTITIONS.entries()) {
      if (!index) continue;
      // A maximum 1/4-support tap interval overlaps the already filtered support.
      expect(part.capacity / 4).toBeLessThanOrEqual(part.start);
    }
  }
  expect(variants.size).toBe(4);
});
