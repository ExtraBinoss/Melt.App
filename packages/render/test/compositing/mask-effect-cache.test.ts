import { afterEach, expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage } from "@musart/core";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { GpuPasses } from "../../src/compositing/passes";
import { EffectResources } from "../../src/compositing/effect-resources";
import { makeGpuRenderer } from "../gpu-fixture";
import { installCanvasMock } from "../canvas-fixture";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("retains effect pixels while moving masked artwork, but updates its world mask and source edits", async () => {
  installCanvasMock();
  const { renderer } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer);
  const mask = createLayer("ellipse", {
    id: "fixed-mask",
    x: 20,
    y: 10,
    width: 90,
    height: 70,
    maskSource: true,
  });
  const artwork = createLayer("rectangle", {
    id: "moving-artwork",
    x: 10,
    y: 5,
    width: 100,
    height: 80,
    effects: [createEffect("blur"), createEffect("brightness"), createEffect("grain")],
    mask: { layerId: mask.id, enabled: true, inverted: false },
  });
  const page = createPage({ width: 160, height: 120, layers: [artwork, mask] });
  const mapping = vi.spyOn(GpuPasses.prototype, "maskTo");
  try {
    await graph.render(page, {});
    const before = graph.stats(),
      firstMapping = mapping.mock.calls.at(-1)![4];
    const moved = { ...artwork, x: 30, y: 15 };
    await graph.render({ ...page, layers: [moved, mask] }, {});
    expect(graph.stats().effectPasses).toBe(before.effectPasses);
    expect(graph.stats().targets).toBeLessThanOrEqual(before.targets + 1);
    expect(mapping).toHaveBeenCalledTimes(2);
    expect(mapping.mock.calls.at(-1)![4]).not.toEqual(firstMapping);
    const changed = { ...moved, effects: [createEffect("contrast")] };
    await graph.render({ ...page, layers: [changed, mask] }, {});
    expect(graph.stats().effectPasses).toBeGreaterThan(before.effectPasses!);
    const changedPasses = graph.stats().effectPasses;
    // Turning a mask off can overwrite the same effects target. Restoring the old
    // stack must redraw it rather than reuse a signature attached to overwritten pixels.
    await graph.render({ ...page, layers: [{ ...changed, mask: null }, mask] }, {});
    await graph.render(page, {});
    expect(graph.stats().effectPasses).toBeGreaterThan(changedPasses!);
    const apply = vi.spyOn(EffectResources.prototype, "apply");
    apply.mockImplementationOnce(() => {
      throw Error("interrupted effect draw");
    });
    await expect(
      graph.render({ ...page, layers: [{ ...artwork, fill: "#ff0000" }, mask] }, {}),
    ).rejects.toThrow("interrupted effect draw");
    const beforeRecovery = graph.stats().effectPasses;
    await graph.render(page, {});
    expect(graph.stats().effectPasses).toBeGreaterThan(beforeRecovery!);
  } finally {
    await graph.dispose();
  }
  expect(graph.stats().targets).toBe(0);
});
it("retains effect pixels across clipping moves and combines clipping after an independent mask", async () => {
  installCanvasMock();
  const { renderer } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer);
  const base = createLayer("ellipse", { id: "base", opacity: 0.7 }),
    mask = createLayer("rectangle", { id: "mask", maskSource: true }),
    artwork = createLayer("rectangle", {
      id: "artwork",
      effects: [createEffect("blur")],
      mask: { layerId: mask.id, enabled: true, inverted: false, mode: "alpha" },
      clipping: { layerId: base.id },
    }),
    page = createPage({ layers: [base, mask, artwork] });
  const mapping = vi.spyOn(GpuPasses.prototype, "maskTo");
  try {
    await graph.render(page, {});
    const before = graph.stats();
    expect(mapping.mock.calls.slice(-2).map((call) => call[4]?.opacity)).toEqual([1, 0.7]);
    const moved = { ...artwork, x: 20 };
    await graph.render({ ...page, layers: [base, mask, moved] }, {});
    expect(graph.stats().effectPasses).toBe(before.effectPasses);
    await graph.render({ ...page, layers: [{ ...base, x: 45 }, mask, moved] }, {});
    expect(graph.stats().effectPasses).toBe(before.effectPasses);
    expect(mapping).toHaveBeenCalledTimes(6);
    expect(mapping.mock.calls[1]![3]).not.toBe(mapping.mock.calls[0]![3]);
  } finally {
    await graph.dispose();
  }
  expect(graph.stats().targets).toBe(0);
});
