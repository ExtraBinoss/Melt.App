import { afterEach, expect, it, vi } from "vitest";
import { createStore } from "jotai";
import {
  captureEffectTreatment,
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
} from "@musart/core";
import type { ImageAsset } from "@musart/core";
import { EffectPresetPreviewController } from "../../../src/services/effect-presets/preview-controller";
import { effectPresetPreview } from "../../../src/services/effect-presets/preview";
import type { SavedTreatment } from "../../../src/services/effect-presets/store";
import { previewAtom } from "../../../src/state/session/editor";
import { createPreviewSource } from "../../../src/state/session/preview-source";
import { SceneController } from "../../../src/canvas/session/scene-controller";

function fixture() {
  const effect = createEffect("grain", { id: "grain", amount: 0.12 }),
    layer = createLayer("rectangle", { id: "owner", effects: [effect] });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ id: "page", layers: [layer] })] }),
  );
  engine.select([layer.id]);
  const saved = (id: string, amount: number): SavedTreatment => {
    const treatment = captureEffectTreatment(id, id, [{ ...effect, amount }], {}, "effect");
    return {
      id,
      name: id,
      kind: "effect",
      types: ["grain"],
      revision: 1,
      updatedAt: 0,
      deleted: false,
      treatment,
    };
  };
  const store = createStore(),
    error = vi.fn(),
    cancel = vi.fn();
  return { engine, store, error, cancel, saved, effect };
}
afterEach(() => vi.useRealTimers());
it("serializes hover reads, retires stale results and restores canonical values without commands or undo", async () => {
  vi.useFakeTimers();
  const d = fixture(),
    before = d.engine.getSnapshot();
  const requests: { id: string; resolve: (record: SavedTreatment | null) => void }[] = [];
  const get = vi.fn(
    (id: string) => new Promise<SavedTreatment | null>((resolve) => requests.push({ id, resolve })),
  );
  const controller = new EffectPresetPreviewController({
    engine: d.engine,
    read: () => d.store.get(previewAtom),
    write: (value) => d.store.set(previewAtom, value),
    context: () => ({
      effectId: "grain",
      layerId: "owner",
      get,
      onError: d.error,
      onCancel: d.cancel,
    }),
  });
  controller.start();
  controller.preview("first");
  await vi.advanceTimersByTimeAsync(60);
  controller.preview("second");
  await vi.advanceTimersByTimeAsync(60);
  expect(get).toHaveBeenCalledTimes(1);
  requests[0]!.resolve(d.saved("first", 0.4));
  await vi.advanceTimersByTimeAsync(0);
  expect(get).toHaveBeenCalledTimes(2);
  expect(d.store.get(previewAtom)).toBeNull();
  requests[1]!.resolve(d.saved("second", 0.8));
  await vi.advanceTimersByTimeAsync(0);
  const preview = d.store.get(previewAtom)!;
  expect(preview.patch.effects![0]!.amount).toBe(0.8);
  expect(d.engine.getSnapshot()).toBe(before);
  controller.cancel();
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot()).toBe(before);
  controller.dispose();
});
it("does not overwrite another gesture, deleted presets, changed selection or disposed owners", async () => {
  vi.useFakeTimers();
  const d = fixture();
  let resolve!: (value: SavedTreatment | null) => void;
  const get = () =>
    new Promise<SavedTreatment | null>((done) => {
      resolve = done;
    });
  const controller = new EffectPresetPreviewController({
    engine: d.engine,
    read: () => d.store.get(previewAtom),
    write: (value) => d.store.set(previewAtom, value),
    context: () => ({ effectId: "grain", layerId: "owner", get, onError: d.error }),
  });
  controller.start();
  controller.preview("missing");
  await vi.advanceTimersByTimeAsync(60);
  resolve(null);
  await vi.advanceTimersByTimeAsync(0);
  expect(d.error).toHaveBeenCalledWith("Preset unavailable");
  controller.preview("foreign");
  await vi.advanceTimersByTimeAsync(60);
  const foreign = { target: "page", patch: { background: "#123456" } } as const;
  d.store.set(previewAtom, foreign);
  resolve(d.saved("foreign", 0.6));
  await vi.advanceTimersByTimeAsync(0);
  expect(d.store.get(previewAtom)).toBe(foreign);
  controller.preview("selection");
  await vi.advanceTimersByTimeAsync(60);
  d.engine.select([]);
  resolve(d.saved("selection", 0.6));
  await vi.advanceTimersByTimeAsync(0);
  expect(d.store.get(previewAtom)).toBe(foreign);
  controller.preview("disposed");
  await vi.advanceTimersByTimeAsync(60);
  controller.dispose();
  resolve(d.saved("disposed", 0.6));
  await vi.advanceTimersByTimeAsync(0);
  expect(d.store.get(previewAtom)).toBe(foreign);
  controller.start();
  d.store.set(previewAtom, null);
  controller.preview("restarted");
  await vi.advanceTimersByTimeAsync(60);
  resolve(d.saved("restarted", 0.6));
  await vi.advanceTimersByTimeAsync(0);
  expect(d.store.get(previewAtom)?.patch.effects![0]!.amount).toBe(0.6);
  controller.dispose();
  expect(d.store.get(previewAtom)).toBeNull();
});
it("previews imported image inputs in the frame without adding assets to the project and retires their lineage", () => {
  const map: ImageAsset = {
    id: "map",
    name: "map",
    width: 2,
    height: 2,
    mime: "image/png",
    dataUrl: "data:image/png;base64,AAAA",
  };
  const effect = createEffect("displace", { id: "displace" });
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({ layers: [createLayer("rectangle", { id: "owner", effects: [effect] })] }),
      ],
    }),
  );
  const treatment = captureEffectTreatment(
    "map-preset",
    "Map",
    [{ ...effect, inputs: { map: map.id } }],
    { map },
    "effect",
  );
  const origin = engine.getSnapshot(),
    store = createStore(),
    scene = new SceneController(engine, createPreviewSource(store));
  const first = effectPresetPreview(origin, effect.id, "owner", treatment);
  store.set(previewAtom, first);
  const frame = scene.read(),
    id = frame.page.layers[0]!.effects[0]!.inputs!.map!;
  expect(frame.assets[id]).toMatchObject({ dataUrl: map.dataUrl });
  expect(origin.project.assets[id]).toBeUndefined();
  expect(engine.getSnapshot()).toBe(origin);
  const second = effectPresetPreview(origin, effect.id, "owner", treatment);
  store.set(previewAtom, second);
  expect(scene.read().presentation?.preview).not.toBe(frame.presentation?.preview);
  store.set(previewAtom, null);
  expect(scene.read().assets).toBe(origin.project.assets);
  expect(scene.read().presentation?.canonical).toBe(true);
});
