import { useEffect, type RefObject } from "react";
import { invertMatrix, transformPoint, type EnginePort } from "@musart/core";
import { effectInputSession } from "../../components/properties/effects/effect-motion/input-session";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import { sourceGeometry, sourcePagePoint } from "../selection/frame-geometry";

const excluded =
  "[data-canvas-control], [data-handle], [data-effect-gizmo-id], button, input, textarea, select, [contenteditable], [role=menu], [role=dialog]";
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Recording is the explicit interaction-test mode. No listeners write document keys. */
export function installCanvasEffectInput(
  element: HTMLElement,
  engine: EnginePort,
  controller: SceneController,
  view: ViewSource,
  cancelGesture: () => void,
) {
  const source = effectInputSession(engine);
  let session = source.read();
  let origin = engine.getSnapshot();
  let captured: number | null = null;
  let keyboardDrag = false;
  let point = { x: 0.5, y: 0.5 };
  const inside = (event: Event) =>
    event.target instanceof Element &&
    element.contains(event.target) &&
    !event.target.closest(excluded);
  const block = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  function release() {
    const id = captured;
    captured = null;
    keyboardDrag = false;
    if (id !== null && element.hasPointerCapture(id)) element.releasePointerCapture(id);
  }
  function cancel() {
    release();
    session?.cancel();
  }
  function refresh() {
    const next = source.read();
    if (next === session) return;
    release();
    session = next;
    origin = engine.getSnapshot();
    point = { x: 0.5, y: 0.5 };
    if (session) cancelGesture();
  }
  function position(event: PointerEvent) {
    if (!session) return false;
    const page = controller.read().page;
    if (session.owner && session.owner.compositionId !== page.id) return false;
    const pagePoint = sourcePagePoint(controller, element, view, event);
    const layer =
      session.owner?.layerId && page.layers.find((item) => item.id === session!.owner?.layerId);
    if (session.owner?.layerId && !layer) return false;
    const local = layer
      ? transformPoint(invertMatrix(sourceGeometry(controller).worldMatrix(layer.id)), pagePoint)
      : pagePoint;
    const width = layer ? layer.width : page.width;
    const height = layer ? layer.height : page.height;
    if (!(width > 0 && height > 0)) return false;
    point = { x: clamp(local.x / width), y: clamp(local.y / height) };
    return true;
  }
  const pointer = (dragging: boolean) => session?.emit({ kind: "pointer", ...point, dragging });
  function down(event: PointerEvent) {
    if (!session || !inside(event)) return;
    if (
      session.kind !== "pointerDrag" &&
      session.kind !== "primaryClick" &&
      session.kind !== "secondaryClick"
    )
      return;
    const button = session.kind === "secondaryClick" ? 2 : 0;
    if (event.button !== button) return;
    block(event);
    if (captured !== null || !position(event)) return;
    cancelGesture();
    element.focus({ preventScroll: true });
    captured = event.pointerId;
    element.setPointerCapture(event.pointerId);
    if (session.kind === "pointerDrag") pointer(true);
  }
  function move(event: PointerEvent) {
    if (!session || (captured !== event.pointerId && !inside(event))) return;
    if (captured !== null && captured !== event.pointerId) return;
    if (captured === event.pointerId) block(event);
    if (position(event) && session.kind !== "primaryClick" && session.kind !== "secondaryClick")
      pointer(captured === event.pointerId);
  }
  function up(event: PointerEvent) {
    if (!session || captured !== event.pointerId) return;
    const button = session.kind === "secondaryClick" ? 2 : 0;
    if (event.button !== button) return;
    block(event);
    position(event);
    if (session.kind === "pointerDrag") {
      pointer(true);
      pointer(false);
    } else if (session.kind === "primaryClick" || session.kind === "secondaryClick")
      session.emit({ kind: session.kind });
    release();
  }
  function pointerCancel(event: PointerEvent) {
    if (session && (captured === event.pointerId || inside(event))) cancel();
  }
  function lost(event: PointerEvent) {
    if (captured === event.pointerId) cancel();
  }
  function context(event: MouseEvent) {
    if (session?.kind === "secondaryClick" && inside(event)) block(event);
  }
  function keyDown(event: KeyboardEvent) {
    if (!session) return;
    if (event.key === "Escape") {
      block(event);
      cancel();
      return;
    }
    if (!inside(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (
      (event.key === "Enter" || event.key === " ") &&
      (session.kind === "primaryClick" || session.kind === "secondaryClick")
    ) {
      block(event);
      if (!event.repeat) session.emit({ kind: session.kind });
      return;
    }
    if (
      !event.key.startsWith("Arrow") ||
      session.kind === "primaryClick" ||
      session.kind === "secondaryClick"
    )
      return;
    block(event);
    if (session.kind === "pointerDrag" && !keyboardDrag) pointer(true);
    keyboardDrag = session.kind === "pointerDrag";
    const step = event.shiftKey ? 0.1 : 0.025;
    point = {
      x: clamp(
        point.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
      ),
      y: clamp(point.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)),
    };
    pointer(keyboardDrag);
  }
  function keyUp(event: KeyboardEvent) {
    if (session && keyboardDrag && event.key.startsWith("Arrow")) {
      block(event);
      keyboardDrag = false;
      pointer(false);
    }
  }
  const visibility = () => {
    if (document.hidden) cancel();
  };
  const unsubscribe = source.subscribe(refresh);
  const unwatch = engine.subscribe(() => {
    if (!session) return;
    const next = engine.getSnapshot();
    if (next.project !== origin.project || next.pageId !== origin.pageId) cancel();
  });
  if (session) cancelGesture();
  element.addEventListener("pointerdown", down, true);
  element.addEventListener("pointermove", move, true);
  element.addEventListener("pointerup", up, true);
  element.addEventListener("pointercancel", pointerCancel, true);
  element.addEventListener("lostpointercapture", lost, true);
  element.addEventListener("contextmenu", context, true);
  element.addEventListener("keydown", keyDown, true);
  element.addEventListener("keyup", keyUp, true);
  window.addEventListener("keydown", keyDown, true);
  window.addEventListener("blur", cancel);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    unsubscribe();
    unwatch();
    cancel();
    element.removeEventListener("pointerdown", down, true);
    element.removeEventListener("pointermove", move, true);
    element.removeEventListener("pointerup", up, true);
    element.removeEventListener("pointercancel", pointerCancel, true);
    element.removeEventListener("lostpointercapture", lost, true);
    element.removeEventListener("contextmenu", context, true);
    element.removeEventListener("keydown", keyDown, true);
    element.removeEventListener("keyup", keyUp, true);
    window.removeEventListener("keydown", keyDown, true);
    window.removeEventListener("blur", cancel);
    document.removeEventListener("visibilitychange", visibility);
  };
}

export function useCanvasEffectInput(
  engine: EnginePort,
  viewport: RefObject<HTMLDivElement | null>,
  controller: SceneController,
  view: ViewSource,
  cancelGesture: () => void,
) {
  useEffect(
    () =>
      viewport.current
        ? installCanvasEffectInput(viewport.current, engine, controller, view, cancelGesture)
        : undefined,
    [engine, viewport, controller, view, cancelGesture],
  );
}
