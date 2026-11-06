import { expect, it, vi } from "vitest";
import {
  applyMotionFrame,
  compileMotion,
  createEffect,
  createLayer,
  createPage,
  createProject,
  createSpatialScene,
  EditorEngine,
  evaluateMotion,
  type Composition,
} from "@musart/core";
import { RenderTarget, Texture } from "three/webgpu";
import type { GpuCompositor } from "../../../src/compositing/GpuCompositor";
import type { RenderOptions } from "../../../src/compositing/types";
import { TemporalEffectSources } from "../../../src/effects/trail/TemporalEffectSources";
import { makeGpuRenderer } from "../../gpu-fixture";

function fixture() {
  const trail = createEffect("trail", { id: "trail", settings: { echoCount: 2, delay: 0.25 } });
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          width: 400,
          height: 300,
          spatial: createSpatialScene(),
          layers: [
            createLayer("group", { id: "parent", x: 0, y: 0, width: 200, height: 200 }),
            createLayer("rectangle", {
              id: "owner",
              parentId: "parent",
              width: 20,
              height: 20,
              effects: [trail],
            }),
            createLayer("rectangle", { id: "neighbour", x: 90 }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const [kind, id, end] of [
    ["layer", "owner", 100],
    ["layer", "parent", 200],
    ["camera", "page", 90],
  ] as const) {
    for (const [value, at] of [
      [0, 0],
      [end, 1],
    ] as const)
      engine.execute({
        type: "upsertMotionKeyframe",
        target:
          kind === "layer"
            ? { kind, layerId: id, property: "x" }
            : { kind, compositionId: id, property: "yaw" },
        time: { value: at, rate: 1 },
        value,
      });
  }
  const program = compileMotion(engine.getSnapshot().project, { compositionId: "page" });
  const motionFrame = evaluateMotion(program, { value: 1, rate: 1 });
  return { page: applyMotionFrame(program, motionFrame), motionFrame };
}

it("renders exact prior owner, parent and camera poses while retaining neighbour scene context", async () => {
  const { renderer } = makeGpuRenderer(),
    { page, motionFrame } = fixture(),
    input = new Texture(),
    calls: { page: Composition; options: RenderOptions }[] = [],
    reserve = vi.fn(),
    child = {
      render: vi.fn(async (page: Composition, _assets: object, options: RenderOptions) => {
        calls.push({ page, options });
        return { texture: input, width: 400, height: 300, premultiplied: true };
      }),
      dispose: vi.fn(async () => undefined),
      stats: () => ({ targets: 0, passes: 0, effectPasses: 0, uploads: 0 }),
    },
    sources = new TemporalEffectSources(
      renderer,
      64 * 1024 * 1024,
      () => child as unknown as GpuCompositor,
      reserve,
    );
  const history = await sources.prepare(page, {}, { motionFrame });
  expect(calls.map((call) => call.page.layers[1]!.x)).toEqual([75, 50]);
  expect(calls.map((call) => call.page.layers[0]!.x)).toEqual([150, 100]);
  expect(calls.map((call) => call.page.spatial!.camera.yaw)).toEqual([67.5, 45]);
  for (const call of calls) {
    expect(call.page.layers.some((layer) => layer.id === "neighbour")).toBe(true);
    expect(call.page.layers[1]!.effects).toEqual([]);
    expect(call.options).toMatchObject({
      history: "disabled",
      effectCapture: true,
      effectCaptureOwnerId: "owner",
    });
  }
  expect(history.get("trail")?.map((sample) => sample.ownerBounds?.x)).toEqual([225, 150]);
  expect(history.get("trail")?.[0]?.captureBounds).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  expect(page.layers[1]!.x).toBe(100);
  expect(page.layers[1]!.effects).toHaveLength(1);
  await sources.prepare(page, {}, { motionFrame, history: "disabled" });
  expect(sources.stats().targets).toBe(0);
  await sources.dispose();
  expect(child.dispose).toHaveBeenCalledOnce();
  expect(reserve).toHaveBeenLastCalledWith(0);
  input.dispose();
});

it("rejects superseded historical results before allocating snapshots", async () => {
  const { renderer } = makeGpuRenderer(),
    { page, motionFrame } = fixture(),
    controller = new AbortController(),
    input = new Texture(),
    allocated = vi.spyOn(RenderTarget.prototype, "setSize"),
    sources = new TemporalEffectSources(
      renderer,
      64 * 1024 * 1024,
      () =>
        ({
          render: async () => {
            controller.abort();
            return { texture: input, width: 400, height: 300, premultiplied: true };
          },
          dispose: async () => undefined,
          stats: () => ({ targets: 0, passes: 0, effectPasses: 0, uploads: 0 }),
        }) as unknown as GpuCompositor,
      () => undefined,
    );
  await expect(
    sources.prepare(page, {}, { motionFrame, signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(allocated).not.toHaveBeenCalled();
  expect(sources.stats().targets).toBe(0);
  await sources.dispose();
  allocated.mockRestore();
  input.dispose();
});
