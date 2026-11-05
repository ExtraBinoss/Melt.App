import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
import { createTimelineHoverSource } from "../../../src/state/motion/hover";
import { installCanvasHover } from "../../../src/canvas/selection/canvas-hover";

function setup(preview = EMPTY_PREVIEW_SOURCE, studio = false) {
  const layer = createLayer("ellipse", { id: "ellipse", x: 0, y: 0, width: 100, height: 100 });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ width: 100, height: 100, layers: [layer] })] }),
  );
  const controller = new SceneController(engine, preview);
  const node = document.createElement("div");
  document.body.append(node);
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON() {},
  });
  const callbacks = new Map<number, () => void>();
  let next = 0,
    active = false;
  const stop = installCanvasHover(
    node,
    engine,
    controller,
    { read: () => ({ x: 0, y: 0, zoom: 1 }), subscribe: () => () => {} },
    () => active,
    {
      request: (callback) => {
        callbacks.set(++next, callback);
        return next;
      },
      cancel: (id) => {
        callbacks.delete(id);
      },
    },
    studio,
  );
  const move = (x: number, y: number, buttons = 0) =>
    node.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, buttons }),
    );
  const flush = () => {
    const batch = [...callbacks.values()];
    callbacks.clear();
    for (const callback of batch) callback();
  };
  return {
    engine,
    controller,
    node,
    move,
    flush,
    callbacks,
    hover: createTimelineHoverSource(engine),
    active: (value: boolean) => {
      active = value;
    },
    stop: () => {
      stop();
      node.remove();
    },
  };
}
test("canvas hover coalesces moves, keeps exact ellipse hits and leaves selection/history untouched", () => {
  const d = setup(),
    before = d.engine.getSnapshot();
  d.move(20, 20);
  d.move(50, 50);
  expect(d.callbacks.size).toBe(1);
  d.flush();
  expect(d.hover.read()?.layerId).toBe("ellipse");
  expect(d.engine.getSnapshot()).toBe(before);
  d.move(1, 1);
  d.flush();
  expect(d.hover.read()).toBeNull();
  d.stop();
  expect(d.callbacks.size).toBe(0);
});
test("gesture start, pointer leave, controls and disposal release only their own hover lease", () => {
  const d = setup();
  d.move(50, 50);
  d.flush();
  const newer = d.hover.show(d.engine.getSnapshot().pageId, "ellipse");
  d.node.dispatchEvent(new PointerEvent("pointerleave"));
  expect(d.hover.read()?.layerId).toBe("ellipse");
  newer();
  d.active(true);
  d.move(50, 50);
  d.flush();
  expect(d.hover.read()).toBeNull();
  d.active(false);
  d.move(50, 50, 1);
  d.flush();
  expect(d.hover.read()).toBeNull();
  d.move(50, 50);
  d.node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  d.flush();
  expect(d.hover.read()).toBeNull();
  const control = document.createElement("button");
  control.dataset.canvasControl = "true";
  d.node.append(control);
  control.dispatchEvent(
    new PointerEvent("pointermove", { bubbles: true, clientX: 50, clientY: 50 }),
  );
  d.flush();
  expect(d.hover.read()).toBeNull();
  d.move(50, 50);
  d.stop();
  expect(d.callbacks.size).toBe(0);
  expect(d.hover.read()).toBeNull();
});

test("camera drafts suspend picking and resume from the last pointer after cancellation", () => {
  let value: ReturnType<typeof EMPTY_PREVIEW_SOURCE.read> = null;
  const listeners = new Set<() => void>();
  const d = setup({
    read: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  const publish = () => {
    for (const listener of listeners) listener();
  };
  try {
    d.move(50, 50);
    d.flush();
    expect(d.hover.read()?.layerId).toBe("ellipse");
    value = { target: "page", patch: { background: "#000000" } };
    publish();
    expect(d.callbacks.size).toBe(0);
    expect(d.hover.read()).toBeNull();
    for (let i = 0; i < 20; i++) {
      value = { ...value };
      publish();
    }
    expect(d.callbacks.size).toBe(0);
    value = null;
    publish();
    expect(d.callbacks.size).toBe(1);
    d.flush();
    expect(d.hover.read()?.layerId).toBe("ellipse");
  } finally {
    d.stop();
  }
});

test("Studio hover hands its existing silhouette to selection without an empty publication", async () => {
  const d = setup(EMPTY_PREVIEW_SOURCE, true);
  const visible: string[][] = [];
  const record = () =>
    visible.push([
      ...new Set([
        ...d.engine.getSnapshot().selection,
        ...(d.hover.read() ? [d.hover.read()!.layerId] : []),
      ]),
    ]);
  d.move(50, 50);
  d.flush();
  const original = d.hover.read();
  const stopHover = d.hover.subscribe(record),
    stopEngine = d.engine.subscribe(record);
  try {
    d.node.dispatchEvent(
      new PointerEvent("pointerdown", { button: 0, bubbles: true, clientX: 50, clientY: 50 }),
    );
    expect(d.hover.read()).toBe(original);
    d.move(51, 50, 1);
    expect(d.hover.read()).toBe(original);
    expect(d.callbacks.size).toBe(0);
    d.node.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }));
    d.engine.select(["ellipse"]);
    await Promise.resolve();
    expect(d.hover.read()).toBeNull();
    expect(visible).toEqual([["ellipse"], ["ellipse"]]);
    expect(d.engine.getSnapshot().canUndo).toBe(false);
    d.node.dispatchEvent(new PointerEvent("pointerleave"));
    expect(d.engine.getSnapshot().selection).toEqual(["ellipse"]);
  } finally {
    stopHover();
    stopEngine();
    d.stop();
  }
});

test("Studio click retention ends on real movement, cancellation, blur and disposal", async () => {
  const d = setup(EMPTY_PREVIEW_SOURCE, true);
  const press = () => {
    d.move(50, 50);
    d.flush();
    d.node.dispatchEvent(
      new PointerEvent("pointerdown", { button: 0, bubbles: true, clientX: 50, clientY: 50 }),
    );
  };
  try {
    press();
    d.move(60, 50, 1);
    expect(d.hover.read()).toBeNull();
    press();
    d.node.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
    expect(d.hover.read()).toBeNull();
    press();
    window.dispatchEvent(new Event("blur"));
    expect(d.hover.read()).toBeNull();
    press();
    d.node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    const newer = d.hover.show(d.engine.getSnapshot().pageId, "ellipse");
    await Promise.resolve();
    expect(d.hover.read()?.layerId).toBe("ellipse");
    newer();
    press();
    d.node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    d.stop();
    await Promise.resolve();
    expect(d.hover.read()).toBeNull();
    expect(d.callbacks.size).toBe(0);
  } finally {
    d.stop();
  }
});
