import { afterEach, expect, test, vi } from "vitest";
import { createEffect, createLayer, createPage } from "@musart/core";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { EffectResources } from "../../src/compositing/effect-resources";
import { makeGpuRenderer } from "../gpu-fixture";
import { installCanvasMock } from "../canvas-fixture";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("bounded preview references keep authored effect domains and exact exports retain their density", async () => {
  installCanvasMock();
  const { renderer } = makeGpuRenderer();
  const graph = new GpuCompositor(renderer, { maxBytes: 64 * 1024 * 1024 });
  const apply = vi.spyOn(EffectResources.prototype, "apply");
  const layer = createLayer("rectangle", {
    width: 4096,
    height: 2048,
    effects: [createEffect("blur")],
  });
  const page = createPage({ width: 4096, height: 2048, layers: [layer] });
  await graph.render(page, {}, { scale: 0.1, effectSourceScale: 0.1 });
  const call = apply.mock.calls.at(-1)!;
  expect(call[1]).toBeLessThan(480);
  expect(call[2]).toBeLessThan(260);
  expect(call[5]!.width).toBeGreaterThanOrEqual(4096);
  expect(call[5]!.content).toMatchObject({ width: 4096, height: 2048 });
  expect(graph.stats().cacheBytes).toBeLessThan(64 * 1024 * 1024);
  await expect(graph.render(page, {}, { scale: 0.1 })).rejects.toThrow("Budget mémoire GPU");
  await graph.dispose();
  expect(graph.stats().cacheBytes).toBe(0);
});
