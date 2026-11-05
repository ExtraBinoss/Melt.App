import { afterEach, expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage } from "@musart/core";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { EffectResources } from "../../src/compositing/effect-resources";
import { GpuPasses } from "../../src/compositing/passes";
import { makeGpuRenderer } from "../gpu-fixture";
import { installCanvasMock } from "../canvas-fixture";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("continues real GPU background paint and both effect stacks across an expanded display gate without changing canonical output", async () => {
  installCanvasMock();
  const { renderer } = makeGpuRenderer();
  const graph = new GpuCompositor(renderer);
  const gradient = {
    kind: "linear" as const,
    angle: 20,
    stops: [
      { offset: 0, color: "#ffffff" },
      { offset: 1, color: "#000000" },
    ],
  };
  const page = createPage({
    width: 120,
    height: 80,
    background: "transparent",
    layers: [
      createLayer("rectangle", {
        id: "background",
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        fillGradient: gradient,
        effects: [createEffect("grain")],
      }),
      createLayer("ellipse", { id: "object", x: 40, y: 20, width: 40, height: 40 }),
    ],
    effects: [createEffect("invert")],
  });
  const before = structuredClone(page);
  const viewport = { x: -40, y: -20, width: 200, height: 120 };
  const clear = vi.spyOn(GpuPasses.prototype, "clear");
  const apply = vi.spyOn(EffectResources.prototype, "apply");
  try {
    const display = await graph.render(page, {}, { viewport, scale: 0.5 });
    expect(display).toMatchObject({ width: 100, height: 60, bounds: viewport });
    expect(
      clear.mock.calls.some(
        (call) =>
          call[2] === gradient &&
          call[3]?.width === 120 &&
          JSON.stringify(call[3].region) === JSON.stringify(viewport),
      ),
    ).toBe(true);
    expect(
      apply.mock.calls
        .filter((call) => call[1] === 100 && call[2] === 60)
        .map((call) => call[3][0]!.type),
    ).toEqual(["grain", "invert"]);
    expect(await graph.render(page, {}, { scale: 0.5 })).toMatchObject({ width: 60, height: 40 });
    expect(page).toEqual(before);
    await expect(
      graph.render(page, {}, { viewport: { ...viewport, width: Infinity } }),
    ).rejects.toThrow("Invalid composition display viewport");
  } finally {
    await graph.dispose();
  }
  expect(graph.stats()).toMatchObject({ targets: 0, cacheBytes: 0 });
});

it("redraws a cached shape when only its gradient angle or radial center changes", async () => {
  installCanvasMock();
  const { renderer } = makeGpuRenderer();
  const graph = new GpuCompositor(renderer);
  const layer = createLayer("rectangle", {
    width: 120,
    height: 80,
    fillGradient: {
      kind: "linear",
      angle: 0,
      stops: [
        { offset: 0, color: "#ffffff" },
        { offset: 1, color: "#000000" },
      ],
    },
  });
  const page = createPage({ width: 120, height: 80, layers: [layer] });
  const draw = vi.spyOn(GpuPasses.prototype, "shapeTo");
  try {
    await graph.render(page, {});
    for (const gradient of [
      { ...layer.fillGradient!, angle: 90 },
      { ...layer.fillGradient!, kind: "radial" as const, centerX: 0.8, centerY: 0.2 },
    ])
      await graph.render({ ...page, layers: [{ ...layer, fillGradient: gradient }] }, {});
    expect(draw).toHaveBeenCalledTimes(3);
    expect(draw.mock.calls[2]![0].fillGradient).toMatchObject({ centerX: 0.8, centerY: 0.2 });
  } finally {
    await graph.dispose();
  }
});

it("anchors a resized background's extended paint in its local frame and suppresses the old underlay", async () => {
  installCanvasMock();
  const { renderer } = makeGpuRenderer();
  const graph = new GpuCompositor(renderer);
  const gradient = {
    kind: "linear" as const,
    angle: 0,
    stops: [
      { offset: 0, color: "#24272C" },
      { offset: 1, color: "#CCCCCC" },
    ],
  };
  const page = createPage({
    width: 120,
    height: 80,
    background: "#8844ff",
    backgroundGradient: gradient,
    layers: [
      createLayer("rectangle", {
        id: "wall",
        name: "Arrière-plan",
        x: 20,
        y: 10,
        width: 60,
        height: 40,
        fillGradient: gradient,
      }),
    ],
  });
  const clear = vi.spyOn(GpuPasses.prototype, "clear");
  const viewport = { x: -40, y: -20, width: 200, height: 120 };
  try {
    await graph.render(page, {}, { viewport });
    expect(
      clear.mock.calls.some((call) => call[1] === "transparent" && call[2] === undefined),
    ).toBe(true);
    expect(clear.mock.calls.find((call) => call[2] === gradient)?.[3]).toEqual({
      width: 60,
      height: 40,
      region: { x: -60, y: -30, width: 200, height: 120 },
    });
    clear.mockClear();
    await graph.render(page, {});
    expect(clear.mock.calls.find((call) => call[2] === gradient)?.[3]).toEqual({
      width: 60,
      height: 40,
      region: { x: -20, y: -10, width: 120, height: 80 },
    });
  } finally {
    await graph.dispose();
  }
});

it("retains the composition backdrop beneath an ordinary full-frame translucent rectangle", async () => {
  installCanvasMock();
  const { renderer } = makeGpuRenderer();
  const graph = new GpuCompositor(renderer);
  const page = createPage({
    width: 120,
    height: 80,
    background: "#8844ff",
    layers: [
      createLayer("rectangle", {
        width: 120,
        height: 80,
        name: "Overlay",
        fill: "#ff0000",
        opacity: 0.5,
      }),
    ],
  });
  const clear = vi.spyOn(GpuPasses.prototype, "clear");
  try {
    await graph.render(page, {});
    expect(clear.mock.calls.some((call) => call[1] === "#8844ff")).toBe(true);
  } finally {
    await graph.dispose();
  }
});

it("reuses the same background storage while its frame translates and resizes", async () => {
  installCanvasMock();
  const { renderer } = makeGpuRenderer();
  const graph = new GpuCompositor(renderer);
  const layer = createLayer("rectangle", {
    id: "wall",
    name: "Arrière-plan",
    x: 20,
    width: 60,
    height: 40,
    effects: [createEffect("grain")],
  });
  const page = createPage({ width: 120, height: 80, layers: [layer] });
  const viewport = { x: -40, y: -20, width: 200, height: 120 };
  const render = (x: number) =>
    graph.render({ ...page, layers: [{ ...layer, x, width: 60 }] }, {}, { viewport });
  const apply = vi.spyOn(EffectResources.prototype, "apply");
  try {
    await render(20);
    await render(21);
    const targets = graph.stats().targets;
    let applied = apply.mock.calls.length;
    for (const x of [22, 23, 24, 25]) {
      await render(x);
      expect(graph.stats().targets).toBe(targets);
      expect(apply.mock.calls.length).toBe(++applied);
    }
  } finally {
    await graph.dispose();
  }
});

it("keeps an infinite background's effect coordinates in its authored frame as the display window changes", async () => {
  installCanvasMock();
  const { renderer } = makeGpuRenderer();
  const graph = new GpuCompositor(renderer);
  const layer = createLayer("rectangle", {
    id: "glass-background",
    name: "Arrière-plan",
    x: 20,
    y: 10,
    width: 120,
    height: 80,
    effects: [createEffect("shatter")],
  });
  const page = createPage({ width: 160, height: 100, layers: [layer] });
  const apply = vi.spyOn(EffectResources.prototype, "apply");
  try {
    for (const viewport of [
      { x: -40, y: -20, width: 240, height: 140 },
      { x: 30, y: 20, width: 80, height: 60 },
    ]) {
      await graph.render(page, {}, { viewport });
      expect(apply.mock.calls.at(-1)![5]).toEqual({
        width: viewport.width,
        height: viewport.height,
        content: {
          x: layer.x - viewport.x,
          y: layer.y - viewport.y,
          width: layer.width,
          height: layer.height,
        },
      });
    }
  } finally {
    await graph.dispose();
  }
});
