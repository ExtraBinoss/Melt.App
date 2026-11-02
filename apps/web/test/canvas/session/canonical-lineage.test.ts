import { expect, test } from "vitest";
import { createStore } from "jotai";
import { createEffect, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createPreviewSource } from "../../../src/state/session/preview-source";
import { previewAtom } from "../../../src/state/session/editor";

function fixture() {
  const layer = createLayer("rectangle", { effects: [createEffect("blur")] });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  const store = createStore(),
    controller = new SceneController(engine, createPreviewSource(store));
  return { layer, engine, store, controller };
}

test("actual synchronous scalar/history summaries publish once and certify only their contiguous scope", () => {
  const d = fixture();
  const frames: ReturnType<SceneController["read"]>[] = [];
  const stop = d.controller.subscribe(() => frames.push(d.controller.read()));
  for (const opacity of [0.2, 0.4, 0.6])
    d.engine.execute({ type: "updateLayers", ids: [d.layer.id], patch: { opacity } });
  expect(frames).toHaveLength(3);
  const scalar = frames[0]!.presentation?.continuation;
  expect(scalar).toBeDefined();
  expect(frames.every((frame) => frame.presentation?.continuation === scalar)).toBe(true);
  d.engine.undo();
  const history = d.controller.read().presentation?.continuation;
  expect(history).toBeDefined();
  expect(history).not.toBe(scalar);
  d.engine.undo();
  d.engine.redo();
  expect(d.controller.read().presentation?.continuation).toBe(history);
  d.engine.select([d.layer.id]);
  expect(d.controller.read().presentation?.continuation).toBeUndefined();
  d.engine.execute({ type: "addLayers", layers: [createLayer("ellipse")] });
  expect(d.controller.read().presentation?.continuation).toBeUndefined();
  d.engine.undo();
  expect(d.controller.read().presentation?.continuation).toBeUndefined();
  d.engine.load(d.engine.getSnapshot().project);
  expect(d.controller.read().presentation?.continuation).toBeUndefined();
  stop();
});

test("earlier UI observers can read each pending revision without consuming its commit certification", () => {
  const d = fixture();
  const speculative: ReturnType<SceneController["read"]>[] = [];
  // Inspector/presentation observers can read the scene before SceneController's
  // own engine subscription and before the engine delivers synchronous metadata.
  const stopObserver = d.engine.subscribe(() => speculative.push(d.controller.read()));
  const frames: ReturnType<SceneController["read"]>[] = [];
  const stop = d.controller.subscribe(() => frames.push(d.controller.read()));
  for (const opacity of [0.2, 0.4, 0.6])
    d.engine.execute({ type: "updateLayers", ids: [d.layer.id], patch: { opacity } });
  expect(frames).toHaveLength(3);
  const scalar = frames[0]!.presentation?.continuation;
  expect(scalar).toBeDefined();
  expect(frames.every((frame) => frame.presentation?.continuation === scalar)).toBe(true);
  expect(speculative.every((frame) => frame.presentation?.continuation === undefined)).toBe(true);
  d.engine.undo();
  const history = d.controller.read().presentation?.continuation;
  expect(history).toBeDefined();
  expect(history).not.toBe(scalar);
  d.engine.undo();
  d.engine.redo();
  expect(d.controller.read().presentation?.continuation).toBe(history);
  expect(frames).toHaveLength(6);
  expect(speculative.every((frame) => frame.presentation?.continuation === undefined)).toBe(true);
  d.engine.load(d.engine.getSnapshot().project);
  expect(d.controller.read().presentation?.continuation).toBeUndefined();
  d.engine.select([d.layer.id]);
  expect(d.controller.read().presentation?.continuation).toBeUndefined();
  stop();
  stopObserver();
});

test("stroke-width and scalar previews continue useful frames and retire canonical certification", () => {
  const d = fixture(),
    stop = d.controller.subscribe(() => {});
  d.engine.execute({ type: "updateLayers", ids: [d.layer.id], patch: { opacity: 0.5 } });
  expect(d.controller.read().presentation?.continuation).toBeDefined();
  d.store.set(previewAtom, { target: "layer", layerId: d.layer.id, patch: { strokeWidth: 2 } });
  const preview = d.controller.read().presentation?.preview;
  expect(preview).toBeDefined();
  expect(d.controller.read().presentation?.continuation).toBeUndefined();
  d.store.set(previewAtom, { target: "layer", layerId: d.layer.id, patch: { strokeWidth: 10 } });
  expect(d.controller.read().presentation?.preview).toBe(preview);
  d.store.set(previewAtom, null);
  expect(d.controller.read().presentation?.continuation).toBeUndefined();
  d.engine.execute({ type: "updateLayers", ids: [d.layer.id], patch: { effects: [] } });
  expect(d.controller.read().presentation?.continuation).toBeUndefined();
  d.controller.setGesture([{ layerId: d.layer.id, patch: { x: 30 } }]);
  expect(d.controller.read().presentation?.continuation).toBeUndefined();
  stop();
});

test("a selection published inside a commit still exposes that canonical frame without certifying an old selection", () => {
  const d = fixture();
  const stopSelection = d.engine.subscribe(() => {
    const snapshot = d.engine.getSnapshot();
    if (snapshot.revision === 1 && !snapshot.selection.length) d.engine.select([d.layer.id]);
  });
  const frames: ReturnType<SceneController["read"]>[] = [];
  const stop = d.controller.subscribe(() => frames.push(d.controller.read()));
  d.engine.execute({ type: "updateLayers", ids: [d.layer.id], patch: { opacity: 0.5 } });
  expect(frames).toHaveLength(1);
  expect(frames[0]!.page.layers[0]!.opacity).toBe(0.5);
  expect(frames[0]!.presentation?.continuation).toBeUndefined();
  expect(d.engine.getSnapshot().selection).toEqual([d.layer.id]);
  stop();
  stopSelection();
});

test("opacity key previews hand off to each synchronous scalar commit while true cancellation retires the lease", async () => {
  const d = fixture();
  const stopObserver = d.engine.subscribe(() => d.controller.read());
  const stop = d.controller.subscribe(() => {});
  d.engine.execute({ type: "updateLayers", ids: [d.layer.id], patch: { opacity: 0.2 } });
  const scalar = d.controller.read().presentation?.continuation;
  expect(scalar).toBeDefined();
  for (const opacity of [0.3, 0.4, 0.5]) {
    d.store.set(previewAtom, { target: "layers", layerIds: [d.layer.id], patch: { opacity } });
    expect(d.controller.read().presentation?.baseContinuation).toBe(scalar);
    expect(d.controller.read().presentation?.continuation).toBeUndefined();
    // Exact useLayerPreview.command order: cancel() clears the draft, then run()
    // synchronously executes a separately undoable validated command.
    d.store.set(previewAtom, null);
    expect(d.controller.read().presentation?.continuation).toBeUndefined();
    d.engine.execute({ type: "updateLayers", ids: [d.layer.id], patch: { opacity } });
    expect(d.controller.read().presentation?.continuation).toBe(scalar);
    await Promise.resolve();
    expect(d.controller.read().presentation?.continuation).toBe(scalar);
  }
  expect(d.engine.getSnapshot().revision).toBe(4);
  d.store.set(previewAtom, { target: "layer", layerId: d.layer.id, patch: { opacity: 0.8 } });
  d.store.set(previewAtom, null);
  expect(d.controller.read().presentation?.continuation).toBeUndefined();
  await Promise.resolve();
  expect(d.controller.read().presentation?.baseContinuation).toBeUndefined();
  d.engine.execute({ type: "updateLayers", ids: [d.layer.id], patch: { opacity: 0.9 } });
  const afterCancel = d.controller.read().presentation?.continuation;
  expect(afterCancel).toBeDefined();
  expect(afterCancel).not.toBe(scalar);
  d.store.set(previewAtom, { target: "layer", layerId: d.layer.id, patch: { opacity: 0.7 } });
  d.store.set(previewAtom, null);
  d.engine.load(d.engine.getSnapshot().project);
  expect(d.controller.read().presentation?.continuation).toBeUndefined();
  expect(d.controller.read().presentation?.baseContinuation).toBeUndefined();
  d.engine.execute({ type: "updateLayers", ids: [d.layer.id], patch: { opacity: 0.6 } });
  expect(d.controller.read().presentation?.continuation).not.toBe(afterCancel);
  stop();
  stopObserver();
});
