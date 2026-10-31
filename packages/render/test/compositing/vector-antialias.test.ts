import { afterEach, expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import type { RenderTarget } from "three/webgpu";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { VectorSources } from "../../src/surface/vector/source";
import { makeGpuRenderer } from "../gpu-fixture";
afterEach(() => vi.restoreAllMocks());
it("keeps preview coverage separate from exact cache hits, reuses geometry and preserves fixed references", async () => {
  const { renderer } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer),
    render = vi.spyOn(VectorSources.prototype, "render"),
    vector = createLayer("vector", {
      id: "svg",
      width: 40,
      height: 30,
      vector: { viewBox: "0 0 40 30", path: "M0 0L40 30H0Z" },
    }),
    engine = new EditorEngine(
      createProject({ pages: [createPage({ width: 64, height: 64, layers: [vector] })] }),
    ),
    project = engine.getSnapshot().project,
    page = project.pages[0]!;
  const exact = await graph.render(page, project.assets),
    exactBytes = graph.stats().cacheBytes;
  expect((render.mock.calls.at(-1)![1] as RenderTarget).samples).toBe(0);
  expect(graph.retainedFrame(page, project.assets, 1, undefined, "display", true)).toBeNull();
  const preview = await graph.render(page, project.assets, { vectorAntialias: true });
  expect(preview.texture).not.toBe(exact.texture);
  expect(render.mock.calls.at(-1)![1].samples).toBe(4);
  expect(graph.retainedFrame(page, project.assets, 1, undefined, "display", true)).toBe(preview);
  expect(graph.retainedFrame(page, project.assets, 1)).toBe(exact);
  const stats = graph.stats();
  expect(stats.vectorParses).toBe(1);
  expect(stats.cacheBytes - exactBytes).toBe(64 * 64 * 4 * 2 + 40 * 30 * 4 * 5);
  expect(await graph.render(page, project.assets, { vectorAntialias: true })).toBe(preview);
  expect(graph.stats().passes).toBe(stats.passes);
  const fixed = { ...page, layers: [{ ...vector, effects: [createEffect("brightness")] }] };
  await graph.render(fixed, project.assets, { vectorAntialias: true });
  expect(render.mock.calls.at(-1)![1].samples).toBe(0);
  expect(graph.stats().readbacks).toBe(0);
  await graph.dispose();
  expect(graph.stats()).toMatchObject({ cacheBytes: 0, targets: 0 });
});
it("rejects coverage storage before GPU submission when the hard budget cannot admit it", async () => {
  const { renderer } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer, { maxBytes: 20_000 }),
    render = vi.spyOn(VectorSources.prototype, "render"),
    layer = createLayer("vector", {
      width: 64,
      height: 64,
      vector: { viewBox: "0 0 64 64", path: "M0 0L64 64H0Z" },
    });
  await expect(
    graph.render(
      createPage({ width: 64, height: 64, layers: [layer] }),
      {},
      { vectorAntialias: true },
    ),
  ).rejects.toThrow();
  expect(render).not.toHaveBeenCalled();
  await graph.dispose();
  expect(graph.stats().cacheBytes).toBe(0);
});
