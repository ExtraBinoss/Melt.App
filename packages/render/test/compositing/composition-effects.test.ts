import { afterEach, expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage } from "@musart/core";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { EffectResources } from "../../src/compositing/effect-resources";
import { GpuPasses } from "../../src/compositing/passes";
import { NormalBatch } from "../../src/compositing/normal-batch";
import { ColorPipeline } from "../../src/color/ColorPipeline";
import { makeGpuRenderer } from "../gpu-fixture";
import { installCanvasMock } from "../canvas-fixture";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("applies the complete composition stack after source-over and before output color, retaining and recovering frames", async () => {
  installCanvasMock();
  const { renderer } = makeGpuRenderer();
  const graph = new GpuCompositor(renderer);
  const page = createPage({
    width: 120,
    height: 80,
    colorSpace: "display-p3",
    layers: [
      createLayer("rectangle", { effects: [createEffect("brightness")] }),
      createLayer("rectangle", { opacity: 0.5 }),
    ],
    effects: [createEffect("contrast"), createEffect("grain")],
  });
  const apply = vi.spyOn(EffectResources.prototype, "apply");
  const normal = vi.spyOn(NormalBatch.prototype, "draw");
  const color = vi.spyOn(ColorPipeline.prototype, "render");
  const copy = vi.spyOn(GpuPasses.prototype, "copyTo");
  try {
    const first = await graph.render(page, {});
    expect(first).toMatchObject({ width: 120, height: 80, premultiplied: true });
    const globalCall = apply.mock.calls.findIndex((call) => call[3][0]?.type === "contrast");
    expect(globalCall).toBeGreaterThanOrEqual(0);
    expect(apply.mock.calls[globalCall]![3]).toEqual(page.effects);
    const order = apply.mock.invocationCallOrder[globalCall]!;
    expect(normal.mock.invocationCallOrder.at(-1)).toBeLessThan(order);
    expect(color.mock.invocationCallOrder.at(-1)).toBeGreaterThan(order);
    expect(copy.mock.calls.some((call) => call[2] === true)).toBe(true);
    expect(copy.mock.calls.some((call) => call[3] === true)).toBe(true);
    const calls = apply.mock.calls.length;
    await graph.render(page, {});
    expect(apply).toHaveBeenCalledTimes(calls);
    apply.mockImplementationOnce(() => {
      throw Error("global effect failed");
    });
    await expect(graph.render({ ...page, effects: [createEffect("invert")] }, {})).rejects.toThrow(
      "global effect failed",
    );
    await graph.render(page, {});
    expect(apply.mock.calls.length).toBeGreaterThan(calls + 1);
    const beforeDisabled = apply.mock.calls.length;
    await graph.render(
      { ...page, effects: page.effects!.map((effect) => ({ ...effect, enabled: false })) },
      {},
    );
    expect(apply).toHaveBeenCalledTimes(beforeDisabled);
  } finally {
    await graph.dispose();
  }
  expect(graph.stats()).toMatchObject({ targets: 0, cacheBytes: 0 });
});
