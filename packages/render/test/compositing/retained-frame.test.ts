import { afterEach, expect, it, vi } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
} from "@musart/core";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { makeGpuRenderer } from "../gpu-fixture";
afterEach(() => vi.restoreAllMocks());
it("reuses a certified frame through ruler bursts and history without reentering composition, but rejects a paint change", async () => {
  const { renderer } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer),
    engine = new EditorEngine(
      createProject({
        pages: [
          createPage({
            width: 64,
            height: 64,
            layers: [createLayer("rectangle", { width: 20, height: 20 })],
          }),
        ],
      }),
    );
  const original = engine.getSnapshot().project,
    frame = await graph.render(original.pages[0]!, original.assets),
    stats = graph.stats();
  for (let at = 0; at < 60; at++) {
    engine.execute({ type: "updatePage", patch: { rulers: at % 2 === 0 } });
    const current = engine.getSnapshot().project;
    expect(graph.retainedFrame(current.pages[0]!, current.assets, 1)).toBe(frame);
  }
  for (const history of [engine.undo, engine.redo]) {
    history();
    const current = engine.getSnapshot().project;
    expect(graph.retainedFrame(current.pages[0]!, current.assets, 1)).toBe(frame);
  }
  expect(graph.stats()).toMatchObject({
    frames: stats.frames,
    passes: stats.passes,
    uploads: stats.uploads,
    cacheBytes: stats.cacheBytes,
    targets: stats.targets,
  });
  engine.execute({
    type: "updateLayers",
    ids: [original.pages[0]!.layers[0]!.id],
    patch: { fill: "#ff0000" },
  });
  const changed = engine.getSnapshot().project;
  expect(graph.retainedFrame(changed.pages[0]!, changed.assets, 1)).toBeNull();
  await graph.render(changed.pages[0]!, changed.assets);
  expect(graph.retainedFrame(original.pages[0]!, original.assets, 1)).toBeNull();
  await graph.dispose();
  expect(graph.stats()).toMatchObject({ targets: 0, cacheBytes: 0 });
});
it("retains exact pixels through a composition deletion and canvas placement migration without GPU work", async () => {
  const { renderer } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer),
    engine = new EditorEngine(
      createProject({
        pages: Array.from({ length: 4 }, (_, i) =>
          createPage({
            id: `p${i}`,
            width: 64,
            height: 64,
            layers: [createLayer("rectangle", { width: 20, height: 20 })],
          }),
        ),
      }),
    );
  const before = engine.getSnapshot().project;
  const retained = await Promise.all(before.pages.map((page) => graph.render(page, before.assets)));
  const stats = graph.stats();
  engine.setPage("p3");
  engine.execute({ type: "deletePage", id: "p3" });
  const after = engine.getSnapshot().project;
  for (const [i, page] of after.pages.entries())
    expect(graph.retainedFrame(page, after.assets, 1)).toBe(retained[i]);
  expect(graph.stats()).toMatchObject({
    frames: stats.frames,
    passes: stats.passes,
    cacheBytes: stats.cacheBytes,
    uploads: stats.uploads,
  });
  const current = after.pages[0]!;
  engine.setPage(current.id);
  engine.execute({
    type: "updatePage",
    patch: { name: "Renamed", canvasPosition: { x: 100, y: 40 } },
  });
  const renamed = engine.getSnapshot().project;
  expect(graph.retainedFrame(renamed.pages[0]!, renamed.assets, 1)).toBe(retained[0]);
  engine.execute({ type: "updatePage", patch: { background: "#ff0000" } });
  const changed = engine.getSnapshot().project;
  expect(graph.retainedFrame(changed.pages[0]!, changed.assets, 1)).toBeNull();
  await graph.dispose();
  expect(graph.stats()).toMatchObject({ targets: 0, cacheBytes: 0 });
});

it("retains a certified Motion pose through a new media-free plan, while media clocks stay authoritative", async () => {
  const { renderer } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer);
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "motion",
          width: 64,
          height: 64,
          layers: [createLayer("rectangle", { width: 20, height: 20 })],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const project = engine.getSnapshot().project,
    program = compileMotion(project, { compositionId: "motion" });
  const plan = evaluateMotion(program, { value: 0, rate: 1 }),
    page = applyMotionFrame(program, plan);
  const frame = await graph.render(page, project.assets, { motionFrame: plan });
  const later = evaluateMotion(program, { value: 1, rate: 1 });
  expect(graph.retainedFrame(page, project.assets, 1, later)).toBe(frame);
  const media = {
    ...later,
    mediaRequests: [
      {
        layerId: "video",
        assetId: "video",
        sourceTime: { value: 1, rate: 1 },
        mute: false,
        volume: 1,
      },
    ],
  };
  expect(graph.retainedFrame(page, project.assets, 1, media)).toBeNull();
  await graph.dispose();
});
