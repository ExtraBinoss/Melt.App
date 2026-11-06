import { expect, test, vi } from "vitest";
import { createStore } from "jotai/vanilla";
import { Group, PerspectiveCamera } from "three/webgpu";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  EditorEngine,
} from "@musart/core";
import { installSpatialSnapping } from "../../../../src/canvas/spatial/snapping/controls";
import { spatialSnapFeedbackAtom } from "../../../../src/state/snapping/spatial-feedback";
import { snappingPreferences } from "../../../../src/state/snapping/preferences";
import { SceneController } from "../../../../src/canvas/session/scene-controller";
import { EMPTY_PREVIEW_SOURCE } from "../../../../src/state/session/preview-source";
import { SpatialGesture } from "../../../../src/canvas/spatial/gesture";

function fixture() {
  const layer = createLayer("rectangle", {
    id: "moving",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    spatial: { ...createSpatialLayer("box"), x: 0.8 },
  });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ width: 100, height: 100, layers: [layer] })] }),
  );
  engine.select([layer.id]);
  const store = createStore(),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE);
  const gesture = new SpatialGesture(engine, controller, store);
  const host = document.createElement("div"),
    canvas = document.createElement("canvas");
  Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 800 } });
  host.append(canvas);
  document.body.append(host);
  const camera = new PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.z = 4.5;
  camera.updateMatrixWorld(true);
  const proxy = new Group(),
    root = new Group();
  root.add(proxy);
  proxy.position.x = 0.8;
  const transform = new TransformControls(camera, canvas);
  transform.attach(proxy);
  transform.axis = "X";
  const preview = vi.fn(() => gesture.object(proxy));
  const adapter = installSpatialSnapping({
    engine,
    controller,
    store,
    canvas,
    camera,
    proxy,
    transform,
    preview,
  });
  const feedback = () => store.get(spatialSnapFeedbackAtom(engine));
  const dispose = () => {
    adapter.dispose();
    gesture.cancel();
    transform.dispose();
    host.remove();
  };
  return { engine, store, gesture, canvas, proxy, transform, adapter, feedback, preview, dispose };
}

test("native correction previews imperatively, Alt refreshes the raw pose, and release creates one undo", () => {
  const f = fixture(),
    before = f.engine.getSnapshot().project;
  const prefs = snappingPreferences.read();
  snappingPreferences.update({ enabled: true, threshold: 6 });
  try {
    f.gesture.begin("moving", "translate");
    f.adapter.begin("moving");
    f.proxy.position.x = 0.01;
    f.adapter.change();
    f.gesture.object(f.proxy);
    expect(f.proxy.position.x).toBeCloseTo(0);
    expect(f.feedback()).toHaveLength(1);
    expect(f.engine.getSnapshot().project).toBe(before);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
    expect(f.proxy.position.x).toBeCloseTo(0.01);
    expect(f.feedback()).toHaveLength(0);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", altKey: false }));
    expect(f.proxy.position.x).toBeCloseTo(0);
    f.adapter.clear();
    f.gesture.commit();
    expect(f.engine.getSnapshot().project.pages[0]!.layers[0]!.spatial!.x).toBeCloseTo(0);
    expect(f.feedback()).toHaveLength(0);
    f.engine.undo();
    expect(f.engine.getSnapshot().project).toEqual(before);
    expect(f.engine.getSnapshot().canUndo).toBe(false);
    f.engine.redo();
    expect(f.engine.getSnapshot().project.pages[0]!.layers[0]!.spatial!.x).toBeCloseTo(0);
  } finally {
    f.dispose();
    snappingPreferences.update(prefs);
  }
});

test("preferences refresh a held gesture; stale selection and disposal remove cues and listeners", () => {
  const f = fixture(),
    prefs = snappingPreferences.read();
  snappingPreferences.update({ enabled: true, threshold: 6 });
  try {
    f.gesture.begin("moving", "translate");
    f.adapter.begin("moving");
    f.proxy.position.x = 0.01;
    f.adapter.change();
    expect(f.feedback()).toHaveLength(1);
    snappingPreferences.update({ enabled: false });
    expect(f.proxy.position.x).toBeCloseTo(0.01);
    snappingPreferences.update({ enabled: true });
    expect(f.proxy.position.x).toBeCloseTo(0);
    f.engine.select([]);
    expect(f.feedback()).toHaveLength(0);
    f.gesture.cancel();
    expect(f.engine.getSnapshot().canUndo).toBe(false);
    f.dispose();
    f.preview.mockClear();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
    expect(f.preview).not.toHaveBeenCalled();
    expect(document.querySelector("[data-spatial-snap-guides]")).toBeNull();
  } finally {
    snappingPreferences.update(prefs);
  }
});

test("CSS-scaled Classic canvases retain a six-screen-pixel attraction radius", () => {
  const prefs = snappingPreferences.read();
  snappingPreferences.update({ enabled: true, threshold: 6 });
  try {
    for (const width of [800, 1600]) {
      const f = fixture();
      vi.spyOn(f.canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, width, width));
      try {
        f.gesture.begin("moving", "translate");
        f.adapter.begin("moving");
        f.proxy.position.x = 0.018;
        f.adapter.change();
        expect(f.feedback()).toHaveLength(width === 800 ? 1 : 0);
        expect(f.proxy.position.x).toBeCloseTo(width === 800 ? 0 : 0.018);
      } finally {
        f.dispose();
      }
    }
  } finally {
    snappingPreferences.update(prefs);
  }
});

test("the perspective center handle retains the camera quaternion plane even off its optical axis", () => {
  const f = fixture(),
    prefs = snappingPreferences.read();
  snappingPreferences.update({ enabled: true, threshold: 6 });
  try {
    f.transform.axis = "XYZ";
    f.gesture.begin("moving", "translate");
    f.adapter.begin("moving");
    f.proxy.position.set(0.01, 0.01, 0);
    f.adapter.change();
    expect(f.feedback()).toHaveLength(2);
    expect(f.proxy.position.x).toBeCloseTo(0);
    expect(f.proxy.position.y).toBeCloseTo(0);
    expect(f.proxy.position.z).toBeCloseTo(0, 10);
  } finally {
    f.dispose();
    snappingPreferences.update(prefs);
  }
});

test("Shift precision survives outside focus and pointer entry, overrides attraction and releases cleanly", () => {
  const f = fixture(),
    prefs = snappingPreferences.read();
  snappingPreferences.update({ enabled: true, threshold: 6 });
  const input = document.createElement("input");
  document.body.append(input);
  try {
    f.gesture.begin("moving", "translate");
    f.adapter.begin("moving");
    f.proxy.position.x = 0.01;
    f.adapter.change();
    expect(f.feedback()).toHaveLength(1);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Shift", shiftKey: true, bubbles: true }),
    );
    expect(f.transform.translationSnap).toBe(0.1);
    expect(f.transform.rotationSnap).toBeCloseTo(Math.PI / 12);
    expect(f.transform.scaleSnap).toBe(0.1);
    expect(f.feedback()).toHaveLength(0);
    expect(f.proxy.position.x).toBeCloseTo(0.01);
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }));
    expect(f.transform.translationSnap).toBeNull();
    expect(f.transform.rotationSnap).toBeNull();
    expect(f.transform.scaleSnap).toBeNull();
    expect(f.feedback()).toHaveLength(1);
    // A Shift key held before these controls mounted is recovered from native pointer input.
    f.canvas.dispatchEvent(new PointerEvent("pointermove", { shiftKey: true }));
    expect(f.transform.rotationSnap).toBeCloseTo(Math.PI / 12);
    window.dispatchEvent(new Event("blur"));
    expect(f.transform.translationSnap).toBeNull();
    expect(f.transform.rotationSnap).toBeNull();
    expect(f.transform.scaleSnap).toBeNull();
    f.dispose();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }));
    expect(f.transform.rotationSnap).toBeNull();
  } finally {
    input.remove();
    snappingPreferences.update(prefs);
  }
});
