import { MathUtils, Matrix4, Vector3, Vector4, type Camera, type Object3D } from "three/webgpu";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import type { createStore } from "jotai/vanilla";
import {
  SpatialSnapIndex,
  SPATIAL_LAYOUT_SPAN,
  type EnginePort,
  type SnapAxis,
  type SnapVector,
} from "@musart/core";
import type { SceneController } from "../../session/scene-controller";
import { captureGestureOrigin, isGestureOriginCurrent } from "../../interaction/gesture-origin";
import { spatialSnapFeedbackAtom } from "../../../state/snapping/spatial-feedback";
import { snappingPreferences } from "../../../state/snapping/preferences";
import { spatialSnapBounds } from "./bounds";

type Store = ReturnType<typeof createStore>;
interface Options {
  engine: EnginePort;
  controller: SceneController;
  store: Store;
  canvas: HTMLCanvasElement;
  camera: Camera;
  proxy: Object3D;
  transform: TransformControls;
  preview(): void;
}
const ns = "http://www.w3.org/2000/svg";

/** Native controls remain the input owner. This adapter corrects only translation, before preview. */
export function installSpatialSnapping(o: Options) {
  const { engine, controller, store, canvas, camera, proxy, transform } = o;
  const feedback = spatialSnapFeedbackAtom(engine);
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.dataset.spatialSnapGuides = "true";
  Object.assign(svg.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    overflow: "hidden",
    zIndex: "5",
    color: "var(--primary)",
  });
  canvas.parentElement?.append(svg);
  let width = canvas.clientWidth,
    height = canvas.clientHeight;
  const measure = () => {
    const rect = canvas.getBoundingClientRect();
    width = rect.width || canvas.clientWidth;
    height = rect.height || canvas.clientHeight;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  };
  let held: {
    origin: ReturnType<typeof captureGestureOrigin>;
    id: string;
    index: SpatialSnapIndex;
    start: Vector3;
    inverse: Matrix4;
    raw: Vector3;
    plane?: SnapVector;
  } | null = null;
  let alt = false,
    shift = false;
  const matrix = new Matrix4(),
    clip = new Vector4();
  const project = (point: SnapVector) => {
    clip.set(point[0], point[1], point[2], 1).applyMatrix4(matrix);
    const visible = clip.w > 1e-8 && clip.z / clip.w >= -1 && clip.z / clip.w <= 1;
    return {
      x: ((clip.x / clip.w + 1) * width) / 2,
      y: ((1 - clip.y / clip.w) * height) / 2,
      visible,
    };
  };
  const paint = () => {
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const cues = store.get(feedback);
    // At most three engaged constraints; DOM never scales with the document's item count.
    svg.replaceChildren();
    for (const cue of cues) {
      const a = project(cue.from),
        b = project(cue.to);
      if (!a.visible || !b.visible) continue;
      const line = document.createElementNS(ns, "line");
      for (const [key, value] of Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }))
        line.setAttribute(key, String(value));
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-width", "1");
      line.setAttribute("stroke-dasharray", "4 3");
      svg.append(line);
      for (const p of [a, b]) {
        const dot = document.createElementNS(ns, "circle");
        dot.setAttribute("cx", String(p.x));
        dot.setAttribute("cy", String(p.y));
        dot.setAttribute("r", "3");
        dot.setAttribute("fill", "var(--background)");
        dot.setAttribute("stroke", "currentColor");
        svg.append(dot);
      }
    }
    svg.dataset.snapCount = String(cues.length);
  };
  const clear = () => {
    held = null;
    store.set(feedback, []);
  };
  const current = () =>
    held &&
    isGestureOriginCurrent(engine, held.origin) &&
    engine.getSnapshot().selection.length === 1 &&
    engine.getSnapshot().selection[0] === held.id &&
    !controller.read().playback;
  const apply = (capture: boolean) => {
    if (!held) return;
    if (!current()) return clear();
    if (capture) held.raw.copy(proxy.position);
    else proxy.position.copy(held.raw);
    proxy.updateWorldMatrix(true, false);
    const world = proxy.getWorldPosition(new Vector3());
    const delta = world.clone().sub(held.start);
    const allowed = (["X", "Y", "Z"] as const).flatMap((axis, index) =>
      transform.axis?.includes(axis) ? [index as SnapAxis] : [],
    );
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const prefs = snappingPreferences.read();
    const result = held.index.snap(
      delta.toArray() as SnapVector,
      allowed,
      project,
      prefs.threshold,
      prefs.enabled && !alt && !shift,
      held.plane,
    );
    world.add(new Vector3(...result.correction)).applyMatrix4(held.inverse);
    proxy.position.copy(world);
    proxy.updateMatrixWorld(true);
    store.set(feedback, result.cues);
  };
  const refresh = () => {
    if (held) {
      apply(false);
      o.preview();
    }
  };
  const modifiers = (event: KeyboardEvent | PointerEvent) => {
    const changed = alt !== event.altKey || shift !== event.shiftKey;
    alt = event.altKey;
    if (shift !== event.shiftKey) {
      shift = event.shiftKey;
      transform.setTranslationSnap(shift ? 0.1 : null);
      transform.setRotationSnap(shift ? MathUtils.degToRad(15) : null);
      transform.setScaleSnap(shift ? 0.1 : null);
    }
    if (changed) refresh();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "Alt" || event.key === "Shift") modifiers(event);
  };
  const blur = () => {
    alt = false;
    shift = false;
    transform.setTranslationSnap(null);
    transform.setRotationSnap(null);
    transform.setScaleSnap(null);
  };
  const stopPreferences = snappingPreferences.subscribe(refresh);
  const stopFeedback = store.sub(feedback, paint);
  const stopEngine = engine.subscribe(() => {
    if (held && !current()) clear();
  });
  const stopScene = controller.subscribe(() => {
    if (held && !current()) clear();
  });
  const resize = new ResizeObserver(() => {
    measure();
    paint();
  });
  resize.observe(canvas);
  window.addEventListener("blur", blur);
  window.addEventListener("keydown", key, true);
  window.addEventListener("keyup", key, true);
  canvas.addEventListener("pointerdown", modifiers, true);
  canvas.addEventListener("pointermove", modifiers, true);
  canvas.addEventListener("pointerup", modifiers, true);
  return {
    begin(id: string) {
      clear();
      if (transform.mode !== "translate") return;
      measure();
      const page = controller.read().page;
      const boxes = spatialSnapBounds(page, id, canvas);
      if (!boxes) return;
      const h = SPATIAL_LAYOUT_SPAN / 2,
        w = (h * page.width) / page.height;
      boxes.references.push({ id: page.id, kind: "page", min: [-w, -h, 0], max: [w, h, 0] });
      proxy.updateWorldMatrix(true, false);
      const start = proxy.getWorldPosition(new Vector3());
      // Three's free handle uses the camera quaternion, including in perspective.
      const normal = transform.axis === "XYZ" ? camera.getWorldDirection(new Vector3()) : undefined;
      held = {
        id,
        origin: captureGestureOrigin(engine),
        index: new SpatialSnapIndex(boxes.moving, boxes.references),
        start,
        plane: normal?.toArray() as SnapVector | undefined,
        inverse: proxy.parent ? proxy.parent.matrixWorld.clone().invert() : new Matrix4(),
        raw: proxy.position.clone(),
      };
    },
    change: () => apply(true),
    clear,
    dispose() {
      clear();
      stopPreferences();
      stopFeedback();
      stopEngine();
      stopScene();
      resize.disconnect();
      window.removeEventListener("blur", blur);
      blur();
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", key, true);
      canvas.removeEventListener("pointerdown", modifiers, true);
      canvas.removeEventListener("pointermove", modifiers, true);
      canvas.removeEventListener("pointerup", modifiers, true);
      svg.remove();
    },
  };
}
