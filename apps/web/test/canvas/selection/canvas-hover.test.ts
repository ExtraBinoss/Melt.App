import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
import { createTimelineHoverSource } from "../../../src/state/motion/hover";
import { installCanvasHover } from "../../../src/canvas/selection/canvas-hover";

function setup() {
  const layer = createLayer("ellipse", { id: "ellipse", x: 0, y: 0, width: 100, height: 100 });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ width: 100, height: 100, layers: [layer] })] }),
  );
  const controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE);
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
