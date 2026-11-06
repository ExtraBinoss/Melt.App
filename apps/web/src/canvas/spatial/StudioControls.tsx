import { installSpatialSnapping } from "./snapping/controls";
import { useEffect, useMemo, useRef } from "react";
import { useStore } from "jotai";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, Scene, Vector3, type WebGPURenderer } from "three/webgpu";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { StudioOrbit } from "./StudioOrbit";
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
import { wheelZoomFactor } from "../viewport/view";
import { registerCameraNavigation } from "../viewport/camera-navigation";
import { getStudioViewport } from "../../ui/studio/framing/viewport";
import { applyStudioCameraWindow } from "./display-camera";
import { markCanvasPointerHandled } from "../interaction/pointer-pick";

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
    const displayCamera = camera.clone();
    const windowPort = getStudioViewport(engine);
    const displayRegion = () => {
      const frame = controller.read(),
        view = windowPort.read();
      return view?.pageId === frame.page.id && view.projectId === engine.getSnapshot().project.id
        ? view.displayRegion
        : { x: 0, y: 0, width: frame.page.width, height: frame.page.height };
    };
    const presentCamera = () => {
      updateCompositionCamera(displayCamera, controller.read().page, renderer.coordinateSystem);
      applyStudioCameraWindow(displayCamera, controller.read().page, displayRegion());
    };
    const transform = new TransformControls(displayCamera, canvas);
    transform.setSize(0.72);
    transform.attach(proxy);
    transform.enabled = false;
    helper.add(anchor, transform.getHelper());
    const hover = createTimelineHoverSource(engine);
    const contours = new Map<string, SpatialSelectionContour>();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const diagnostic = new URLSearchParams(location.search).has("profile3d");
    const orbit = new StudioOrbit(camera, surface, {
      begin: () => gesture.beginOrbit(),
      preview: () => {
        gesture.camera(camera);
        invalidate();
      },
      commit: () => {
        gesture.commit();
        invalidate();
      },
      cancel: () => {
        gesture.cancel();
        invalidate();
      },
      current: () => gesture.active,
      reducedMotion: () => reducedMotion.matches,
    });
    let interruptedPointer: number | null = null;
    const interruptPointer = (event: PointerEvent) => {
      interruptedPointer = orbit.coasting ? event.pointerId : null;
      if (orbit.coasting) orbit.finish();
    };

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
        box = canvas.getBoundingClientRect(),
        region = displayRegion();
      return canvasHit(
        current.frame.page,
        {
          x: region.x + ((event.clientX - box.left) / box.width) * region.width,
          y: region.y + ((event.clientY - box.top) / box.height) * region.height,
        },
        true,
        current.index,
        true,
      );
    };
    const draw = () => {
      if (!gesture.active)
        updateCompositionCamera(camera, controller.read().page, renderer.coordinateSystem);
      if (diagnostic) {
        const p = camera.position;
        canvas.dataset.spatialOrbitState = orbit.state;
        canvas.dataset.spatialGizmo = JSON.stringify({
          axis: transform.axis,
          dragging: transform.dragging,
          mode: transform.mode,
        });
        canvas.dataset.spatialCamera = JSON.stringify({
          yaw: Math.atan2(p.x, p.z),
          pitch: Math.asin(p.y / p.length()),
          distance: p.length() / camera.zoom,
        });
      }
      if (!ready()) return;
      // Read the actual post-transform CSS size once for every selected silhouette.
      // Framebuffer density can differ while a zoom is settling.
      const contourSize = canvas.getBoundingClientRect();
      const current = source();
      if (!gesture.active)
        updateCompositionCamera(camera, current.frame.page, renderer.coordinateSystem);
      presentCamera();
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
        if (diagnostic) {
          const point = proxy.getWorldPosition(new Vector3()).project(displayCamera);
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
        const animateHover = id === hoverId && !current.snapshot.selection.includes(id) && pulse;
        if (animateHover) pulsing = true;
        let contour = contours.get(id);
        if (!contour) {
          contour = new SpatialSelectionContour(resource);
          contours.set(id, contour);
        }
        const opacity = animateHover
          ? 0.65 + 0.3 * (0.5 + 0.5 * Math.cos((elapsed * Math.PI) / 350))
          : 0.9;
        contour.render(renderer, resource, displayCamera, opacity, contourSize);
      }
      if (pulsing) invalidate();
      if (layer) renderer.render(helper, displayCamera);
    };
    active.current = { draw };
    const change = () => {
      invalidate();
    };
    const snapping = installSpatialSnapping({
      engine,
      controller,
      store,
      canvas,
      camera: displayCamera,
      proxy,
      transform,
      preview: () => {
        gesture.object(proxy);
        invalidate();
      },
    });
    const objectChange = () => {
      snapping.change();
      gesture.object(proxy);
      invalidate();
    };
    const down = () => {
      const layer = source().layer;
      if (layer) {
        gesture.begin(layer.id, targetRef.current?.tool ?? "translate");
        snapping.begin(layer.id);
      }
      orbit.enabled = false;
    };
    const up = () => {
      snapping.clear();
      gesture.commit();
      invalidate();
    };
    transform.addEventListener("change", change);
    transform.addEventListener("objectChange", objectChange);
    transform.addEventListener("mouseDown", down);
    transform.addEventListener("mouseUp", up);
    const gate = (event: PointerEvent) => {
      if (event.pointerType === "touch" && !event.isPrimary) {
        if (!event.defaultPrevented) {
          orbit.finish();
          cancel();
        }
        admitted = false;
        return;
      }
      admitted =
        (ready() ||
          (interruptedPointer === event.pointerId &&
            !controller.read().playback &&
            canvas.dataset.pageId === controller.read().page.id)) &&
        !event.defaultPrevented &&
        !(event.target as Element).closest("[data-canvas-control]") &&
        event.button === 0 &&
        viewport?.dataset.canvasTool === "pointer" &&
        viewport.dataset.navigationHeld !== "true";
      if (!admitted) {
        orbit.enabled = false;
        return;
      }
      const current = source();
      presentCamera();
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
    const claim = (event: Event) => {
      // Suppress the competing React canvas gesture without hiding outside input from Radix.
      if (admitted) markCanvasPointerHandled(event);
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
      snapping.clear();
      orbit.cancel();
      transform.reset();
      transform.dragging = false;
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
    };
    const interruptKey = (event: KeyboardEvent) => {
      if (!orbit.coasting) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      } else orbit.finish();
    };
    const visibility = () => {
      if (document.hidden) cancel();
    };
    const wheel = (event: WheelEvent) => {
      if (
        event.deltaY === 0 ||
        controller.read().playback ||
        (event.target as Element).closest("[data-canvas-control]") ||
        canvas.dataset.pageId !== controller.read().page.id
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      orbit.zoomWheel(wheelZoomFactor(event.deltaY, event.deltaMode, surface.clientHeight));
    };
    const stopCameraNavigation = registerCameraNavigation(surface, {
      begin: () => {
        orbit.finish();
        cancel();
        orbit.beginZoom();
      },
      zoomBy: (factor) => orbit.zoomBy(factor),
      end: () => orbit.endZoom(),
      cancel,
    });
    surface.addEventListener("wheel", wheel, { capture: true, passive: false });
    document.addEventListener("pointerdown", interruptPointer, true);
    document.addEventListener("keydown", interruptKey, true);
    document.addEventListener("visibilitychange", visibility);
    canvas.setAttribute("tabindex", "0");
    surface.addEventListener("pointerdown", gate, true);
    surface.addEventListener("pointerdown", claim);
    surface.addEventListener("pointerup", release);
    surface.addEventListener("pointercancel", cancel, true);
    viewport?.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    const stop = controller.subscribe(() => {
      gesture.invalidate();
      orbit.invalidate();
      invalidate();
    });
    const stopEngine = engine.subscribe(() => {
      gesture.invalidate();
      orbit.invalidate();
      invalidate();
    });
    const stopHover = hover.subscribe(invalidate);
    const stopWindow = windowPort.subscribe(invalidate);
    invalidate();
    return () => {
      active.current = null;
      stop();
      stopEngine();
      stopHover();
      stopWindow();
      stopCameraNavigation();
      cancel();
      surface.removeEventListener("wheel", wheel, true);
      document.removeEventListener("pointerdown", interruptPointer, true);
      document.removeEventListener("keydown", interruptKey, true);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeAttribute("tabindex");
      delete canvas.dataset.spatialOrbitState;
      delete canvas.dataset.spatialGizmo;
      delete canvas.dataset.spatialCamera;
      delete canvas.dataset.spatialCenter;
      delete canvas.dataset.spatialProjection;
      surface.removeEventListener("pointerdown", gate, true);
      surface.removeEventListener("pointerdown", claim);
      surface.removeEventListener("pointerup", release);
      surface.removeEventListener("pointercancel", cancel, true);
      viewport?.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      snapping.dispose();
      transform.dispose();
      orbit.dispose();
      for (const contour of contours.values()) contour.dispose();
      contours.clear();
      helper.clear();
    };
  }, [controller, engine, gesture, invalidate, renderer, store]);
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
