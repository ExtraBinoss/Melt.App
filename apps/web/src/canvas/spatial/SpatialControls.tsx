import { useEffect, useMemo, useRef } from "react";
import { useStore } from "jotai";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Group,
  MathUtils,
  Scene,
  Vector2,
  Vector3,
  type Camera,
  type WebGPURenderer,
} from "three/webgpu";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createSpatialCamera,
  updateSpatialCamera,
  updateSpatialObject,
  updateCompositionCamera,
} from "@musart/render/spatial";
import {
  createLayerGeometryIndex,
  DEFAULT_SPATIAL_SCENE,
  SpatialGeometry,
  type EnginePort,
} from "@musart/core";
import type { SpatialEditTarget } from "../../state/session/spatial-editing";
import { spatialEditingAtom } from "../../state/session/spatial-editing";
import type { SceneController } from "../session/scene-controller";
import { SpatialGesture } from "./gesture";
import { canvasHit } from "../selection/hit";
interface Props {
  engine: EnginePort;
  controller: SceneController;
  target: SpatialEditTarget;
}
export default function SpatialControls({ engine, controller, target }: Props) {
  const store = useStore(),
    invalidate = useThree((s) => s.invalidate);
  const renderer = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const baseScene = useThree((s) => s.scene),
    baseCamera = useThree((s) => s.camera);
  const active = useRef<{ helper: Scene; camera: Camera; update: () => boolean } | null>(null);
  const gesture = useMemo(
    () => new SpatialGesture(engine, controller, store),
    [engine, controller, store],
  );
  const tool = useRef(target.tool);
  useEffect(() => {
    tool.current = target.tool;
    invalidate();
  }, [target.tool, invalidate]);
  useEffect(() => {
    const canvas = renderer.domElement,
      viewport = canvas.closest<HTMLElement>(".editor-canvas");
    const helper = new Scene(),
      proxy = new Group(),
      anchor = new Group();
    anchor.matrixAutoUpdate = false;
    anchor.add(proxy);
    const diagnostic = new URLSearchParams(location.search).has("profile3d");
    const settings = controller.read().page.spatial ?? DEFAULT_SPATIAL_SCENE;
    const orbitCamera = createSpatialCamera(settings.camera, 1);
    // Prepare the native convention before adding the classic-layer projection.
    // Otherwise Renderer resets that projection on its first WebGPU submission.
    orbitCamera.coordinateSystem = renderer.coordinateSystem;
    updateSpatialCamera(orbitCamera, settings.camera, 1);
    const camera = orbitCamera.clone();
    const transform = new TransformControls(camera, canvas),
      orbit = new OrbitControls(orbitCamera, canvas);
    orbit.enableDamping = false;
    orbit.enablePan = false;
    orbit.minDistance = 0.2;
    orbit.maxDistance = 100;
    orbit.minPolarAngle = 0.002;
    orbit.maxPolarAngle = Math.PI - 0.002;
    orbit.enabled = false;
    transform.setSize(0.72);
    transform.attach(proxy);
    helper.add(anchor, transform.getHelper());
    const source = () => {
      const frame = controller.read(),
        snapshot = engine.getSnapshot(),
        index = createLayerGeometryIndex(frame.page);
      const layer = index.byId.get(target.layerId);
      if (
        snapshot.project.id !== target.projectId ||
        snapshot.pageId !== target.pageId ||
        snapshot.selection.length !== 1 ||
        snapshot.selection[0] !== target.layerId ||
        frame.playback ||
        !layer?.spatial?.enabled ||
        index.isLocked(layer.id)
      )
        return null;
      return { frame, layer, index };
    };
    const update = () => {
      const current = source();
      if (
        !current ||
        canvas.dataset.pageId !== current.frame.page.id ||
        canvas.dataset.presentationReady !== "true"
      ) {
        transform.getHelper().visible = false;
        return false;
      }
      const { frame, layer } = current;
      anchor.matrix.fromArray(
        new SpatialGeometry(frame.page, current.index.byId).anchorMatrix(layer.id),
      );
      anchor.updateMatrixWorld(true);
      if (!transform.dragging) updateSpatialObject(proxy, layer.spatial!);
      if (!gesture.active)
        updateCompositionCamera(orbitCamera, frame.page, renderer.coordinateSystem);
      const sourceCamera = orbitCamera;
      (camera as Camera).copy(sourceCamera, false);
      if (transform.mode !== tool.current) transform.setMode(tool.current);
      transform.getHelper().visible = true;
      helper.updateMatrixWorld(true);
      if (diagnostic) {
        const point = proxy.getWorldPosition(new Vector3()).project(camera);
        canvas.dataset.spatialProjection = camera.type;
        canvas.dataset.spatialCenter = JSON.stringify({
          x: (point.x + 1) / 2,
          y: (1 - point.y) / 2,
        });
      }
      return true;
    };
    active.current = { helper, camera, update };
    const changed = () => {
      if (diagnostic)
        canvas.dataset.spatialGizmo = JSON.stringify({
          axis: transform.axis,
          dragging: transform.dragging,
          mode: transform.mode,
        });
      invalidate();
    };
    transform.addEventListener("change", changed);
    const objectChange = () => {
      gesture.object(proxy);
      invalidate();
    };
    const down = () => {
      gesture.begin(target.layerId, tool.current);
      orbit.enabled = false;
    };
    const up = () => {
      gesture.commit();
      invalidate();
    };
    const orbitStart = () => {
      gesture.beginOrbit();
    };
    const orbitChange = () => {
      if (gesture.active) gesture.camera(orbitCamera);
      invalidate();
    };
    const orbitEnd = () => {
      gesture.commit();
      invalidate();
    };
    transform.addEventListener("objectChange", objectChange);
    transform.addEventListener("mouseDown", down);
    transform.addEventListener("mouseUp", up);
    orbit.addEventListener("start", orbitStart);
    orbit.addEventListener("change", orbitChange);
    orbit.addEventListener("end", orbitEnd);
    let admitted = false;
    const pointers = new Set<number>();
    const inside = (event: MouseEvent) => {
      const current = source();
      if (!current) return false;
      const box = canvas.getBoundingClientRect();
      const local = new Vector2(
        ((event.clientX - box.left) / box.width) * current.frame.page.width,
        ((event.clientY - box.top) / box.height) * current.frame.page.height,
      );
      const hit = canvasHit(current.frame.page, local)?.layer;
      return (
        hit?.id === target.layerId ||
        (!!hit && current.index.ancestors(hit.id).some((parent) => parent.id === target.layerId))
      );
    };
    const gate = (event: PointerEvent) => {
      admitted = Boolean(transform.axis || inside(event));
      if (!admitted) {
        transform.enabled = false;
        orbit.enabled = false;
        store.set(spatialEditingAtom(engine), null);
        return;
      }
      pointers.add(event.pointerId);
      transform.enabled = true;
      orbit.enabled = !transform.axis;
      canvas.focus({ preventScroll: true });
    };
    const block = (event: Event) => {
      if (admitted || transform.dragging) event.stopPropagation();
    };
    const wheelGate = (event: WheelEvent) => {
      admitted = inside(event);
      orbit.enabled = admitted && !transform.dragging;
    };
    const context = (event: MouseEvent) => {
      if (inside(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const release = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
    };
    const cancel = () => {
      if (!gesture.active) return;
      gesture.cancel();
      transform.reset();
      transform.dragging = false;
      orbit.disconnect();
      orbit.connect(canvas);
      for (const id of pointers) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      pointers.clear();
      invalidate();
    };
    const key = (event: KeyboardEvent) => {
      if (
        (event.target as Element).closest(
          "input,textarea,[contenteditable=true],[data-canvas-control]",
        )
      )
        return;
      const value = event.key.toLowerCase();
      if (value === "escape") {
        event.preventDefault();
        event.stopPropagation();
        if (gesture.active) cancel();
        else store.set(spatialEditingAtom(engine), null);
      } else if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        ["g", "r", "s"].includes(value)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (!gesture.active)
          store.set(spatialEditingAtom(engine), (current) =>
            current
              ? {
                  ...current,
                  tool: value === "g" ? "translate" : value === "r" ? "rotate" : "scale",
                }
              : null,
          );
      }
      if (event.key === "Shift") {
        transform.setTranslationSnap(0.1);
        transform.setRotationSnap(MathUtils.degToRad(15));
        transform.setScaleSnap(0.1);
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        transform.setTranslationSnap(null);
        transform.setRotationSnap(null);
        transform.setScaleSnap(null);
      }
    };
    canvas.setAttribute("tabindex", "0");
    canvas.setAttribute("data-keybinding-capture", "");
    canvas.setAttribute("data-document-shortcuts", "");
    canvas.addEventListener("pointerdown", gate, true);
    canvas.addEventListener("pointerdown", block);
    canvas.addEventListener("pointercancel", cancel, true);
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("wheel", wheelGate, { capture: true, passive: true });
    canvas.addEventListener("wheel", block);
    canvas.addEventListener("contextmenu", context);
    viewport?.addEventListener("keydown", key, true);
    viewport?.addEventListener("keyup", keyUp, true);
    window.addEventListener("blur", cancel);
    const stop = controller.subscribe(() => {
        gesture.invalidate();
        invalidate();
      }),
      stopEngine = engine.subscribe(() => gesture.invalidate());
    let alive = true;
    void renderer
      .compileAsync(helper, camera)
      .then(() => {
        if (alive) invalidate();
      })
      .catch(() => {
        if (alive) store.set(spatialEditingAtom(engine), null);
      });
    invalidate();
    return () => {
      alive = false;
      active.current = null;
      delete canvas.dataset.spatialGizmo;
      delete canvas.dataset.spatialCenter;
      delete canvas.dataset.spatialProjection;
      stop();
      stopEngine();
      gesture.cancel();
      canvas.removeAttribute("data-keybinding-capture");
      canvas.removeAttribute("data-document-shortcuts");
      canvas.removeAttribute("tabindex");
      canvas.removeEventListener("pointerdown", gate, true);
      canvas.removeEventListener("pointerdown", block);
      canvas.removeEventListener("pointercancel", cancel, true);
      canvas.removeEventListener("pointerup", release);
      canvas.removeEventListener("wheel", wheelGate, true);
      canvas.removeEventListener("wheel", block);
      canvas.removeEventListener("contextmenu", context);
      viewport?.removeEventListener("keydown", key, true);
      viewport?.removeEventListener("keyup", keyUp, true);
      window.removeEventListener("blur", cancel);
      for (const id of pointers) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      pointers.clear();
      transform.dispose();
      orbit.dispose();
      helper.clear();
      invalidate();
    };
  }, [
    controller,
    engine,
    gesture,
    invalidate,
    renderer,
    store,
    target.layerId,
    target.pageId,
    target.projectId,
  ]);
  useFrame(() => {
    renderer.render(baseScene, baseCamera);
    const current = active.current;
    if (!current?.update()) return;
    const auto = renderer.autoClear;
    try {
      renderer.autoClear = false;
      renderer.render(current.helper, current.camera);
    } finally {
      renderer.autoClear = auto;
    }
  }, 1);
  return null;
}
