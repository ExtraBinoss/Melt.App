import { afterEach, expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage } from "@musart/core";
import { RenderTarget } from "three/webgpu";
import { TextSources } from "../../../src/surface/text/source";
import { FontRepository } from "../../../src/surface/text/fonts";
import { GpuResourceCache } from "../../../src/cache/GpuResourceCache";
import { makeGpuRenderer } from "../../gpu-fixture";
import { outlineFont } from "../../text-fixture";
import { morphFixture } from "../../morph-fixture";
afterEach(() => vi.restoreAllMocks());
it("distinguishes cached GPU morph updates from font shaping and atlas reconstruction", async () => {
  const lease = { font: outlineFont(), release: vi.fn() };
  vi.spyOn(FontRepository.prototype, "acquire").mockResolvedValue(lease);
  const { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    source = new TextSources(renderer, cache),
    target = new RenderTarget(64, 64),
    effect = createEffect("morph", { shapeMorph: morphFixture() }),
    layer = createLayer("text", { text: "A", effects: [effect] }),
    page = createPage({ layers: [layer] });
  await source.prepare(page, { target, profile: true });
  const cold = source.stats();
  expect(cold).toMatchObject({
    rebuilds: 1,
    shapings: 1,
    compilations: 1,
    morphShapes: 1,
    morphStates: 2,
  });
  expect(cold.morphSegments).toBeGreaterThanOrEqual(3);
  expect(cold.morphSegments).toBeLessThan(256);
  expect(cold.atlasBytes).toBeGreaterThan(0);
  expect(cold.profile?.atlas).toHaveLength(1);
  for (const phase of ["correspondence", "simplification", "packing"] as const)
    expect(cold.profile?.[phase]).toHaveLength(1);
  for (let i = 0; i < 260; i++) {
    const pose = {
      ...layer,
      effects: [{ ...effect, settings: { ...effect.settings, progress: i / 260 } }],
    };
    await source.prepare({ ...page, layers: [pose] }, { target, profile: true });
    source.render(pose, target);
  }
  const warm = source.stats();
  expect(warm).toMatchObject({
    rebuilds: 1,
    shapings: 1,
    compilations: 1,
    cacheHits: 260,
    morphUpdates: 260,
    draws: 260,
  });
  expect(warm.profile?.update).toHaveLength(256);
  expect(warm.profile?.draw).toHaveLength(256);
  expect(warm.profile?.atlas).toHaveLength(1);
  const snapshot = [...warm.profile!.update!];
  source.render(layer, target);
  expect(warm.profile?.update).toEqual(snapshot);
  await source.prepare(createPage());
  expect(source.stats()).toMatchObject({
    glyphs: 0,
    morphShapes: 0,
    morphSegments: 0,
    atlasBytes: 0,
  });
  source.dispose();
  cache.clear();
  target.dispose();
});
it("keeps timer buffers disabled outside explicit profiling", async () => {
  vi.spyOn(FontRepository.prototype, "acquire").mockResolvedValue({
    font: outlineFont(),
    release: vi.fn(),
  });
  const { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    source = new TextSources(renderer, cache),
    layer = createLayer("text", { text: "A" }),
    target = new RenderTarget(16, 16);
  await source.prepare(createPage({ layers: [layer] }), { target });
  source.render(layer, target);
  expect(source.stats()).toMatchObject({ shapings: 1, rebuilds: 1, glyphs: 1, profile: null });
  source.dispose();
  cache.clear();
  target.dispose();
});
