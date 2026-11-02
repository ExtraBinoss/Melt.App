import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { ObjectSelectionController } from "../../../../src/services/selection/object/controller";
import { PixelSelectionController } from "../../../../src/services/selection/wand/controller";
import { WandClient, type WandWorkerPort } from "../../../../src/services/selection/wand/client";
import { createWandHost } from "../../../../src/services/selection/wand/worker-host";
import type { SelectionClient, MaskResult } from "../../../../src/services/selection/selection";
import type { SelectionPrompt } from "../../../../src/services/selection/prompts";
const dispose: (() => void)[] = [];
afterEach(() => {
  for (const stop of dispose.splice(0)) stop();
});
function mask(alpha = [255, 0, 0]): MaskResult {
  return {
    width: 3,
    height: 3,
    data: new Uint8ClampedArray(
      [...alpha, ...Array.from({ length: 9 - alpha.length }, () => 0)].flatMap((a) => [
        255,
        255,
        255,
        a,
      ]),
    ),
  };
}
function fixture() {
  const asset = {
    id: "original",
    name: "Original",
    mime: "image/png",
    width: 3,
    height: 3,
    dataUrl: "data:image/png;base64,AAAA",
  };
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [createLayer("image", { id: "image", assetId: asset.id, width: 30, height: 30 })],
        }),
      ],
      assets: { original: asset },
    }),
  );
  const host = createWandHost();
  const worker: WandWorkerPort = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage(request) {
      const response = host(request);
      queueMicrotask(() => worker.onmessage?.({ data: response } as MessageEvent));
    },
  };
  const pixels = new PixelSelectionController(engine, {
    pixels: async () =>
      ({ width: 3, height: 3, data: new Uint8ClampedArray(36).fill(255) }) as ImageData,
    encode: () => "data:image/png;base64,BBBB",
    client: () => new WandClient(worker),
  });
  const client = {
    prompt: vi.fn(async (_url: string, _prompt: SelectionPrompt) => mask()),
    scan: vi.fn(async (_url: string): Promise<MaskResult> => ({
      ...mask(),
      candidates: [{ x: 1, y: 0, score: 0.9 }],
    })),
    cancel: vi.fn(),
  };
  const objects = new ObjectSelectionController(
    engine,
    client as unknown as SelectionClient,
    pixels,
  );
  dispose.push(() => {
    objects.dispose();
    pixels.dispose();
  });
  return { engine, objects, pixels, client, worker };
}
it("shares an explicit mask preview with the wand, retains original bytes, and commits once with exact undo/redo", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  await d.objects.point("image", 5, 5, true);
  expect(d.client.prompt).toHaveBeenLastCalledWith("data:image/png;base64,AAAA", {
    points: [{ x: 0.5, y: 0.5, label: 1 }],
  });
  expect(d.pixels.read()).toMatchObject({ selected: 1, busy: false, dragging: false });
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  d.client.prompt.mockResolvedValueOnce(mask([255, 255, 0]));
  await d.objects.point("image", 25, 5, false);
  expect(d.client.prompt.mock.lastCall![1].points).toEqual([
    { x: 0.5, y: 0.5, label: 1 },
    { x: 2, y: 0.5, label: 0 },
  ]);
  await d.objects.box("image", { x: 25, y: 9, right: 1, bottom: 1 });
  expect(d.client.prompt.mock.lastCall![1].box).toEqual({ x: 0.1, y: 0.1, right: 2, bottom: 0.9 });
  await d.pixels.createMask();
  const after = d.engine.getSnapshot().project;
  expect(after.pages[0]!.layers[0]!.mask).toMatchObject({ mode: "luminance", enabled: true });
  expect(after.assets.original).toEqual(before.assets.original);
  expect(d.objects.read()).toBeNull();
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  d.engine.redo();
  expect(d.engine.getSnapshot().project).toEqual(after);
});
it("coalesces rapid corrections, never publishes stale model results, and guards apply while inference is pending", async () => {
  const d = fixture();
  let finish!: (value: MaskResult) => void;
  d.client.prompt.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = d.objects.point("image", 2, 5, true);
  await vi.waitFor(() => expect(d.client.prompt).toHaveBeenCalledOnce());
  const second = d.objects.point("image", 12, 5, false),
    third = d.objects.point("image", 22, 5, true);
  expect(d.pixels.read()?.busy).toBe(true);
  await d.pixels.createMask();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  finish(mask([0, 0, 255]));
  await Promise.all([first, second, third]);
  expect(d.client.prompt).toHaveBeenCalledTimes(2);
  expect(d.client.prompt.mock.lastCall![1].points).toHaveLength(3);
  expect(d.pixels.read()).toMatchObject({ busy: false, selected: 1 });
});
it("invalidates pending work on deselection or document changes and releases the worker on tool exit", async () => {
  const d = fixture();
  await d.objects.point("image", 1, 5, true);
  let finish!: (value: MaskResult) => void;
  d.client.prompt.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = d.objects.point("image", 15, 5, false);
  await vi.waitFor(() => expect(d.client.prompt).toHaveBeenCalledTimes(2));
  d.objects.release();
  expect(d.client.cancel).toHaveBeenCalledOnce();
  finish(mask());
  await pending;
  expect(d.objects.read()).toBeNull();
  expect(d.pixels.read()).toMatchObject({ selected: 1, busy: false });
  await d.objects.point("image", 2, 5, true);
  d.engine.execute({ type: "updateLayers", ids: ["image"], patch: { opacity: 0.5 } });
  expect(d.pixels.read()).toBeNull();
  expect(d.objects.read()).toBeNull();
  await d.objects.point("image", 1, 5, true);
  d.pixels.deselect();
  expect(d.objects.read()).toBeNull();
});
it("offers detected objects as editable prompts and reports failures without committing a mask", async () => {
  const d = fixture();
  await d.objects.scan("image");
  expect(d.objects.read()).toMatchObject({
    busy: false,
    scanning: false,
    points: [{ x: 1, y: 0, label: 1 }],
  });
  await d.objects.candidate(0);
  expect(d.client.prompt.mock.lastCall![1]).toEqual({ points: [{ x: 1, y: 0, label: 1 }] });
  d.client.prompt.mockRejectedValueOnce(Error("decoder failed"));
  await expect(d.objects.point("image", 12, 5, false)).rejects.toThrow("decoder failed");
  expect(d.objects.read()).toMatchObject({ busy: false, error: "decoder failed" });
  expect(d.pixels.read()?.busy).toBe(false);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  await d.pixels.createMask();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  await d.objects.removeLast();
  expect(d.objects.read()?.points).toHaveLength(1);
  await d.objects.removeLast();
  expect(d.objects.read()).toBeNull();
});
it("rejects oversized masks, locked targets and point floods without unbounded queues", async () => {
  const d = fixture();
  await expect(d.objects.point("missing", 0, 0, true)).rejects.toThrow("unlocked");
  d.engine.execute({ type: "updateLayers", ids: ["image"], patch: { locked: true } });
  await expect(d.objects.scan("image")).rejects.toThrow("unlocked");
  d.engine.undo();
  await d.objects.point("image", 1, 5, true);
  await expect(d.pixels.previewMask({ ...mask(), width: 4 })).rejects.toThrow("dimensions");
  for (let i = 1; i < 64; i++) await d.objects.point("image", 1, 5, true);
  await expect(d.objects.point("image", 1, 5, true)).rejects.toThrow("64 points");
  expect(d.client.prompt).toHaveBeenCalledTimes(64);
  d.objects.dispose();
  await expect(d.objects.point("image", 1, 5, true)).rejects.toThrow("cancelled");
});

it("retains completed coverage across tool exit so the wand can refine the same selection", async () => {
  const d = fixture();
  await d.objects.point("image", 1, 5, true);
  d.objects.release();
  expect(d.objects.read()).toBeNull();
  expect(d.pixels.read()?.selected).toBe(1);
  await d.pixels.begin("image", 20, 5, 0, "add");
  await d.pixels.accept();
  expect(d.pixels.read()?.selected).toBe(9);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
