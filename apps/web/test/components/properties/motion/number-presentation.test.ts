import { createSpatialLayer } from "@musart/core";
import { spatialGesturePreview } from "../../../../src/state/session/spatial-preview";
import { expect, test, vi } from "vitest";
import { createNumberPresentation } from "../../../../src/components/properties/motion/number-presentation";
import { setup } from "../../../support/ui";

test("owner and native-field observers share one transport subscription and release it together", () => {
  const d = setup(),
    original = d.engine.subscribe,
    stopped = vi.fn();
  const subscriptions = vi.spyOn(d.engine, "subscribe").mockImplementation((listener) => {
    const stop = original(listener);
    return () => {
      stopped();
      stop();
    };
  });
  const source = createNumberPresentation(
    d.engine,
    [{ kind: "layer", layerId: d.rectangle.id, property: "x" }],
    1,
    () => 7,
  );
  const native = vi.fn(),
    owner = vi.fn();
  const stopOwner = source.subscribeOwner(owner),
    stopNative = source.subscribe(native);
  expect(subscriptions).toHaveBeenCalledTimes(1);
  d.engine.select([d.rectangle.id]);
  expect(native).toHaveBeenCalledOnce();
  expect(owner).not.toHaveBeenCalled();
  d.engine.execute({ type: "updateLayers", ids: [d.text.id], patch: { x: 123 } });
  expect(native).toHaveBeenCalledTimes(2);
  stopOwner();
  expect(stopped).not.toHaveBeenCalled();
  stopNative();
  expect(stopped).toHaveBeenCalledOnce();
  d.engine.undo();
  expect(native).toHaveBeenCalledTimes(2);
});

test("ruler admission shares one metadata observer and never exempts undo or redo", () => {
  const d = setup();
  const metadata = vi.spyOn(d.engine, "subscribeCommitInfo");
  const a = createNumberPresentation(
    d.engine,
    [{ kind: "layer", layerId: d.rectangle.id, property: "x" }],
    1,
    () => 7,
  );
  const b = createNumberPresentation(
    d.engine,
    [{ kind: "layer", layerId: d.rectangle.id, property: "y" }],
    1,
    () => 7,
  );
  const first = vi.fn(),
    second = vi.fn();
  const stopA = a.subscribe(first),
    stopB = b.subscribe(second);
  expect(metadata).toHaveBeenCalledTimes(1);
  d.engine.execute({ type: "updatePage", patch: { rulers: true } });
  expect(first).not.toHaveBeenCalled();
  expect(second).not.toHaveBeenCalled();
  d.engine.undo();
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  d.engine.redo();
  expect(first).toHaveBeenCalledTimes(2);
  expect(second).toHaveBeenCalledTimes(2);
  stopA();
  stopB();
  d.engine.undo();
  expect(first).toHaveBeenCalledTimes(2);
  expect(second).toHaveBeenCalledTimes(2);
});

test("native 3D drafts update numbers without owner renders and restore on cancel or stale scope", () => {
  const d = setup();
  d.engine.select([d.rectangle.id]);
  d.engine.execute({
    type: "updateLayers",
    ids: [d.rectangle.id],
    patch: { spatial: createSpatialLayer("box") },
  });
  const origin = d.engine.getSnapshot();
  const page = origin.project.pages.find((page) => page.id === origin.pageId)!;
  const source = createNumberPresentation(
    d.engine,
    [{ kind: "layer", layerId: d.rectangle.id, property: "spatial.x" }],
    1,
    () => 0,
  );
  const values: (number | null)[] = [];
  const owner = vi.fn();
  const stop = source.subscribe(() => values.push(source.read()));
  const stopOwner = source.subscribeOwner(owner);
  const drafts = spatialGesturePreview(d.engine),
    gesture = {};
  const draft = {
    ...page,
    layers: page.layers.map((layer) =>
      layer.id === d.rectangle.id ? { ...layer, spatial: { ...layer.spatial!, x: 0.7 } } : layer,
    ),
  };
  try {
    drafts.publish(gesture, origin, draft);
    expect(source.read()).toBe(0.7);
    expect(values).toEqual([0.7]);
    expect(owner).not.toHaveBeenCalled();
    expect(d.engine.getSnapshot().project).toBe(origin.project);
    drafts.clear({});
    expect(source.read()).toBe(0.7);
    drafts.clear(gesture);
    expect(source.read()).toBe(0);
    expect(values).toEqual([0.7, 0]);
    drafts.publish(gesture, origin, draft);
    d.engine.select([]);
    expect(source.read()).toBe(0);
    stop();
    stopOwner();
    const count = values.length;
    drafts.clear(gesture);
    expect(values).toHaveLength(count);
  } finally {
    stop();
    stopOwner();
    drafts.clear(gesture);
  }
});
