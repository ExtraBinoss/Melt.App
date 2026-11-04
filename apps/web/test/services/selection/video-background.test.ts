import { afterEach, expect, it, vi } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type VideoAsset,
  type Project,
} from "@musart/core";
import {
  VideoBackgroundController,
  type VideoBackgroundDependencies,
} from "../../../src/services/selection/video/controller";
import type { SelectionClient } from "../../../src/services/selection/selection";
import { backgroundImage } from "../../../src/services/selection/background-action";
vi.mock("../../../src/services/assets/imports", () => ({
  readDataUrl: async () => "data:image/png;base64,AAAA",
}));
const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});
function fixture() {
  const asset: VideoAsset = {
    kind: "video",
    id: "original",
    name: "Source",
    mime: "video/webm",
    width: 64,
    height: 32,
    originalId: "original-blob",
    contentRevision: "revision",
    byteLength: 3,
    duration: { value: 3, rate: 1 },
    firstTimestamp: { value: 7, rate: 1 },
    timeResolution: 1000,
    orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
  };
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("video", {
              id: "subject",
              name: "My person",
              assetId: asset.id,
              width: 64,
              height: 32,
            }),
            createLayer("rectangle", { id: "other" }),
          ],
        }),
      ],
      assets: { original: asset },
    }),
  );
  engine.select(["subject"]);
  const client = {
    cancel: vi.fn(),
    videoPoster: vi.fn(async () => ({ blob: new Blob(["png"]), width: 64, height: 32 })),
    videoBackground: vi.fn(
      async (
        _blob: Blob,
        _asset: VideoAsset,
        progress: (value: { completed: number; total: number }) => void,
      ) => {
        progress({ completed: 1, total: 3 });
        return { blob: new Blob(["matte"], { type: "video/webm" }), width: 64, height: 32 };
      },
    ),
  };
  const store = {
    loadMediaOriginal: vi.fn(async () => new Blob(["vid"])),
    prepareSaveCurrent: vi.fn(
      async (project: Project, options: { mediaOriginals: { blob: Blob }[] }) => ({
        project,
        options,
      }),
    ),
    persistPrepared: vi.fn(async (_prepared: unknown) => {}),
  };
  const dependencies = {
    store,
    probe: vi.fn(async () => ({
      width: 64,
      height: 32,
      duration: asset.duration,
      firstTimestamp: { value: 0, rate: 1 },
      timeResolution: 1000,
      orientation: asset.orientation,
    })),
    maskName: () => "Person matte",
  };
  const controller = new VideoBackgroundController(
    engine,
    client as unknown as SelectionClient,
    dependencies as unknown as VideoBackgroundDependencies,
  );
  stops.push(() => controller.dispose());
  return { controller, engine, asset, client, store };
}
it("routes a selected video through one atomic binary matte commit and preserves selection, audio and undo/redo", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  expect(backgroundImage(d.engine.getSnapshot())).toBe("subject");
  const lease = d.controller.presentation.retain();
  const task = d.controller.removeBackground("subject");
  expect(d.controller.removeBackground("subject")).toBe(task);
  await vi.waitFor(() => expect(d.controller.read()?.thumbnail).toBeDefined());
  expect(d.client.videoBackground).not.toHaveBeenCalled();
  expect(d.controller.read()).toMatchObject({
    targetName: "My person",
    mediaKind: "video",
    busy: true,
  });
  d.engine.select(["other"]);
  d.controller.presentation.painted("subject");
  await task;
  lease();
  const after = d.engine.getSnapshot().project;
  const subject = after.pages[0]!.layers.find((layer) => layer.id === "subject")!;
  expect(subject.assetId).toBe(d.asset.id);
  expect(subject.mask).toMatchObject({ mode: "luminance", enabled: true, inverted: false });
  expect(after.assets[subject.mask!.assetId!]!.kind).toBe("video");
  expect(d.store.persistPrepared).toHaveBeenCalledOnce();
  expect(d.store.prepareSaveCurrent.mock.calls[0]![1].mediaOriginals[0].blob.type).toBe(
    "video/webm",
  );
  expect(d.engine.getSnapshot().selection).toEqual(["other"]);
  expect(d.controller.read()).toMatchObject({
    busy: false,
    completed: true,
    videoProgress: { completed: 1, total: 3 },
  });
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before);
  d.engine.redo();
  expect(d.engine.getSnapshot().project).toEqual(after);
});
it("rejects stale work after a target edit and does not resurrect a deleted layer", async () => {
  const d = fixture();
  let resolve!: (value: { blob: Blob; width: number; height: number }) => void;
  d.client.videoBackground.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const task = d.controller.removeBackground("subject");
  await vi.waitFor(() => expect(d.client.videoBackground).toHaveBeenCalledOnce());
  d.engine.transaction([{ type: "deleteLayers", ids: ["subject"] }]);
  expect(d.client.cancel).toHaveBeenCalled();
  resolve({ blob: new Blob(["matte"]), width: 64, height: 32 });
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(d.store.persistPrepared).not.toHaveBeenCalled();
  expect(d.controller.read()).toBeNull();
});
it("allows unrelated document edits while computing and preserves them", async () => {
  const d = fixture(),
    lease = d.controller.presentation.retain();
  const task = d.controller.removeBackground("subject");
  await vi.waitFor(() => expect(d.controller.read()?.thumbnail).toBeDefined());
  d.engine.transaction([{ type: "updateLayers", ids: ["other"], patch: { x: 81 } }]);
  d.controller.presentation.painted("subject");
  await task;
  lease();
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === "other")!.x,
  ).toBe(81);
  d.engine.undo();
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === "other")!.x,
  ).toBe(81);
});
it("reports persistence failure without publishing the generated mask", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  d.store.persistPrepared.mockRejectedValueOnce(Error("Storage full"));
  await expect(d.controller.removeBackground("subject")).rejects.toThrow("Storage full");
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.controller.read()).toMatchObject({ busy: false, error: "Storage full" });
});
it("cancels source preparation before any model work", async () => {
  const d = fixture(),
    lease = d.controller.presentation.retain();
  const task = d.controller.removeBackground("subject");
  await vi.waitFor(() => expect(d.controller.read()?.thumbnail).toBeDefined());
  d.controller.reset();
  lease();
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(d.client.videoBackground).not.toHaveBeenCalled();
  expect(d.store.prepareSaveCurrent).not.toHaveBeenCalled();
});
