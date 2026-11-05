import { useEffect, useMemo, useRef } from "react";
import { useStore } from "jotai";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, MathUtils, Scene, Vector3, type WebGPURenderer } from "three/webgpu";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createSpatialCamera,
  updateCompositionCamera,
  updateSpatialObject,
  SpatialSelectionContour,
} from "@musart/render/spatial";
import {
  createLayerGeometryIndex,
  DEFAULT_SPATIAL_SCENE,
  SpatialGeometry,
  type EnginePort,
} from "@musart/core";
import type { SpatialEditTarget } from "../../state/session/spatial-editing";
import { createTimelineHoverSource } from "../../state/motion/hover";
import { attachmentSelection } from "../../state/selection/attachments";
import type { SceneController } from "../session/scene-controller";
import { canvasSpatialSource } from "../render/plane-resources";
import { canvasHit } from "../selection/hit";
import { clickSelection } from "../interaction/gestures";
import { SpatialGesture } from "./gesture";

interface Props {
  engine: EnginePort;
  controller: SceneController;
  target: SpatialEditTarget | null;
}
/** Studio owns one camera gesture surface for the whole composition. Selection only
 * enables its native object gizmo; it never changes camera ownership or hit geometry. */
export default function StudioControls({ engine, controller, target }: Props) {
  const store = useStore(),
    invalidate = useThree((state) => state.invalidate);
  const renderer = useThree((state) => state.gl) as unknown as WebGPURenderer;
  const baseScene = useThree((state) => state.scene),
    baseCamera = useThree((state) => state.camera);
  const active = useRef<{ draw: () => void } | null>(null);
  const targetRef = useRef(target);
  const gesture = useMemo(
    () => new SpatialGesture(engine, controller, store),
    [engine, controller, store],
  );
  useEffect(() => {
    targetRef.current = target;
    invalidate();
  }, [target, invalidate]);
  useEffect(() => {
    const canvas = renderer.domElement,
      viewport = canvas.closest<HTMLElement>(".editor-canvas");
    const surface = viewport ?? canvas;
    const helper = new Scene(),
      anchor = new Group(),
      proxy = new Group();
    anchor.matrixAutoUpdate = false;
    anchor.add(proxy);
    const page = controller.read().page;
    const camera = createSpatialCamera(
      (page.spatial ?? DEFAULT_SPATIAL_SCENE).camera,
      page.width / page.height,
    );
    updateCompositionCamera(camera, page, renderer.coordinateSystem);
    const transform = new TransformControls(camera, canvas),
      orbit = new OrbitControls(camera, surface);
    transform.setSize(0.72);
    transform.attach(proxy);
    transform.enabled = false;
    helper.add(anchor, transform.getHelper());
    orbit.enableDamping = false;
    orbit.enablePan = false;
    orbit.enableZoom = false;
    orbit.minDistance = 0.2;
    orbit.maxDistance = 100;
    orbit.minPolarAngle = 0.002;
    orbit.maxPolarAngle = Math.PI - 0.002;
    orbit.enabled = false;
    const hover = createTimelineHoverSource(engine);
    const contours = new Map<string, SpatialSelectionContour>();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let hoverId: string | null = null,
      hoverStart = 0;
    let pointer: {
      id: number;
      x: number;
      y: number;
      additive: boolean;
      transform: boolean;
    } | null = null;
    let admitted = false;
    const source = () => {
      const frame = controller.read(),
        snapshot = engine.getSnapshot(),
        index = createLayerGeometryIndex(frame.page);
      const current = targetRef.current;
      const layer =
        current &&
        current.projectId === snapshot.project.id &&
        current.pageId === frame.page.id &&
        snapshot.selection.length === 1 &&
        snapshot.selection[0] === current.layerId
          ? index.byId.get(current.layerId)
          : null;
      return {
        frame,
        snapshot,
        index,
        layer: layer?.spatial?.enabled && !index.isLocked(layer.id) ? layer : null,
      };
    };
    const ready = () =>
      canvas.dataset.pageId === controller.read().page.id &&
      canvas.dataset.presentationReady === "true" &&
      !controller.read().playback;
    const pick = (event: PointerEvent) => {
      const current = source(),
        box = canvas.getBoundingClientRect();
      return canvasHit(
        current.frame.page,
        {
          x: ((event.clientX - box.left) / box.width) * current.frame.page.width,
          y: ((event.clientY - box.top) / box.height) * current.frame.page.height,
        },
        true,
        current.index,
        true,
      );
    };
    const draw = () => {
      if (!ready()) return;
      // Use the post-transform CSS size, independently of framebuffer density.
      const contourSize = canvas.getBoundingClientRect();
      const current = source();
      if (!gesture.active)
        updateCompositionCamera(camera, current.frame.page, renderer.coordinateSystem);
      const layer = current.layer;
      transform.enabled = Boolean(layer);
      transform.getHelper().visible = Boolean(layer);
      if (layer) {
        anchor.matrix.fromArray(
          new SpatialGeometry(current.frame.page, current.index.byId).anchorMatrix(layer.id),
        );
        anchor.updateMatrixWorld(true);
        if (!transform.dragging) updateSpatialObject(proxy, layer.spatial!);
        const tool = targetRef.current?.tool ?? "translate";
        if (tool !== transform.mode) transform.setMode(tool);
        if (new URLSearchParams(location.search).has("profile3d")) {
          const point = proxy.getWorldPosition(new Vector3()).project(camera);
          canvas.dataset.spatialProjection = camera.type;
          canvas.dataset.spatialCenter = JSON.stringify({
            x: (point.x + 1) / 2,
            y: (1 - point.y) / 2,
          });
        }
      }
      const hovered = hover.read();
      const nextHover =
        hovered?.projectId === current.snapshot.project.id &&
        hovered.compositionId === current.frame.page.id
          ? hovered.layerId
          : null;
      if (nextHover !== hoverId) {
        hoverId = nextHover;
        hoverStart = performance.now();
      }
      const ids = new Set(current.snapshot.selection.slice(0, 64));
      if (hoverId) ids.add(hoverId);
      for (const [id, contour] of contours)
        if (!ids.has(id)) {
          contour.dispose();
          contours.delete(id);
        }
      const elapsed = performance.now() - hoverStart;
      // Two gentle hover pulses, then settle. No perpetual animation clock at idle.
      const pulse = !reducedMotion.matches && elapsed < 1400;
      let pulsing = false;
      for (const id of ids) {
        const item = current.index.byId.get(id),
          resource = canvasSpatialSource(canvas, id);
        if (
          !item?.spatial?.enabled ||
          !resource ||
          resource.closed ||
          !current.index.isVisible(id) ||
          current.index.isMaskSource(id)
        )
          continue;
        if (id === hoverId && pulse) pulsing = true;
        let contour = contours.get(id);
        if (!contour) {
          contour = new SpatialSelectionContour(resource);
          contours.set(id, contour);
        }
        const opacity =
          id === hoverId && pulse
            ? 0.65 + 0.3 * (0.5 + 0.5 * Math.cos((elapsed * Math.PI) / 350))
            : 0.9;
        contour.render(renderer, resource, camera, opacity, contourSize);
      }
      if (pulsing) invalidate();
      if (layer) renderer.render(helper, camera);
    };
    active.current = { draw };
    const change = () => {
      invalidate();
    };
    const objectChange = () => {
      gesture.object(proxy);
      invalidate();
    };
    const down = () => {
      const layer = source().layer;
      if (layer) gesture.begin(layer.id, targetRef.current?.tool ?? "translate");
      orbit.enabled = false;
    };
    const up = () => {
      gesture.commit();
      invalidate();
    };
    const orbitStart = () => gesture.beginOrbit();
    const orbitChange = () => {
      if (gesture.active) gesture.camera(camera);
      invalidate();
    };
    transform.addEventListener("change", change);
    transform.addEventListener("objectChange", objectChange);
    transform.addEventListener("mouseDown", down);
    transform.addEventListener("mouseUp", up);
    orbit.addEventListener("start", orbitStart);
    orbit.addEventListener("change", orbitChange);
    orbit.addEventListener("end", up);
    const gate = (event: PointerEvent) => {
      admitted =
        ready() &&
        !(event.target as Element).closest("[data-canvas-control]") &&
        event.button === 0 &&
        viewport?.dataset.canvasTool === "pointer" &&
        viewport.dataset.navigationHeld !== "true";
      if (!admitted) {
        orbit.enabled = false;
        return;
      }
      const current = source();
      transform.enabled = Boolean(current.layer);
      const box = canvas.getBoundingClientRect();
      if (transform.enabled)
        // The control consumes normalized x/y; PointerEvent exposes those through
        // its clientX/clientY aliases and satisfies Three's public event contract.
        transform.pointerHover(
          new PointerEvent("pointermove", {
            clientX: ((event.clientX - box.left) / box.width) * 2 - 1,
            clientY: 1 - ((event.clientY - box.top) / box.height) * 2,
            button: event.button,
          }),
        );
      const hit = pick(event);
      if (!transform.axis && hit && !hit.layer.spatial?.enabled) {
        admitted = false;
        transform.enabled = false;
        orbit.enabled = false;
        return;
      }
      orbit.enabled = !current.layer || !transform.axis;
      pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
        transform: Boolean(current.layer && transform.axis),
      };
      viewport?.focus({ preventScroll: true });
    };
    const block = (event: Event) => {
      if (admitted) event.stopPropagation();
    };
    const release = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const initial = pointer;
      pointer = null;
      if (
        !initial.transform &&
        Math.hypot(event.clientX - initial.x, event.clientY - initial.y) <= 3
      ) {
        const hit = pick(event),
          selection = engine.getSnapshot().selection;
        attachmentSelection(engine).clear();
        if (hit) engine.select(clickSelection(selection, hit.layer.id, initial.additive));
        else if (!initial.additive) engine.select([]);
      }
      admitted = false;
    };
    const cancel = () => {
      gesture.cancel();
      transform.reset();
      transform.dragging = false;
      orbit.disconnect();
      orbit.connect(surface);
      if (pointer && surface.hasPointerCapture(pointer.id))
        surface.releasePointerCapture(pointer.id);
      pointer = null;
      admitted = false;
      invalidate();
    };
    const key = (event: KeyboardEvent) => {
      if (
        (event.target as Element).closest(
          "input,textarea,[contenteditable=true],[data-canvas-control]",
        )
      )
        return;
      if (event.key === "Escape" && gesture.active) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
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
    surface.addEventListener("pointerdown", gate, true);
    surface.addEventListener("pointerdown", block);
    surface.addEventListener("pointerup", release);
    surface.addEventListener("pointercancel", cancel, true);
    viewport?.addEventListener("keydown", key, true);
    viewport?.addEventListener("keyup", keyUp, true);
    window.addEventListener("blur", cancel);
    const stop = controller.subscribe(() => {
      gesture.invalidate();
      invalidate();
    });
    const stopEngine = engine.subscribe(() => {
      gesture.invalidate();
      invalidate();
    });
    const stopHover = hover.subscribe(invalidate);
    invalidate();
    return () => {
      active.current = null;
      stop();
      stopEngine();
      stopHover();
      cancel();
      canvas.removeAttribute("tabindex");
      delete canvas.dataset.spatialCenter;
      delete canvas.dataset.spatialProjection;
      surface.removeEventListener("pointerdown", gate, true);
      surface.removeEventListener("pointerdown", block);
      surface.removeEventListener("pointerup", release);
      surface.removeEventListener("pointercancel", cancel, true);
      viewport?.removeEventListener("keydown", key, true);
      viewport?.removeEventListener("keyup", keyUp, true);
      window.removeEventListener("blur", cancel);
      transform.dispose();
      orbit.dispose();
      for (const contour of contours.values()) contour.dispose();
      contours.clear();
      helper.clear();
    };
  }, [controller, engine, gesture, invalidate, renderer]);
  useFrame(() => {
    renderer.render(baseScene, baseCamera);
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = false;
      active.current?.draw();
    } finally {
      renderer.autoClear = autoClear;
    }
  }, 1);
  return null;
}
