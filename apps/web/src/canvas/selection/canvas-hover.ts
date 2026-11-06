import type { EnginePort } from "@musart/core";
import { createTimelineHoverSource } from "../../state/motion/hover";
import type { SceneController } from "../session/scene-controller";
import { clientToPage } from "../viewport/view";
import type { ViewSource } from "../viewport/motion";
import { sourceGeometry } from "./frame-geometry";
import { canvasHit } from "./hit";
import { subscribePreparedPicking } from "./picking/prepared-content";

interface Clock {
  request(callback: () => void): number;
  cancel(id: number): void;
}
/** Pointer positions use broad + exact picking; known timeline/layer IDs keep their lookup path. */
export function installCanvasHover(
  node: HTMLElement,
  engine: EnginePort,
  controller: SceneController,
  view: ViewSource,
  active: () => boolean,
  clock: Clock = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  },
  studio = false,
): () => void {
  const hover = createTimelineHoverSource(engine);
  let point: { x: number; y: number } | null = null;
  let pending: number | null = null;
  let release: (() => void) | null = null;
  let layerId: string | null = null;
  let pressed: { id: number; x: number; y: number } | null = null;
  function clear() {
    if (pending !== null) clock.cancel(pending);
    pending = null;
    release?.();
    release = null;
    layerId = null;
  }
  function paint() {
    pending = null;
    const frame = controller.read();
    if (!point || active() || frame.presentation?.canonical === false) {
      clear();
      return;
    }
    // Read all layout before the hover lease synchronously paints its outline.
    const rect = node.getBoundingClientRect();
    const location = clientToPage(point, rect, view.read(), frame.page);
    const picked = canvasHit(frame.page, location, false, sourceGeometry(controller), studio);
    const id = picked?.layer.id ?? null;
    if (id === layerId && hover.read()?.layerId === id) return;
    const previous = release;
    release = id ? hover.show(frame.page.id, id) : null;
    layerId = id;
    previous?.();
  }
  function schedule() {
    if (pressed) return;
    if (controller.read().presentation?.canonical === false) {
      clear();
      return;
    }
    if (point && pending === null) pending = clock.request(paint);
  }
  function move(event: PointerEvent) {
    if (pressed) {
      if (
        event.pointerId === pressed.id &&
        event.buttons === 1 &&
        Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) <= 3
      )
        return;
      leave();
      return;
    }
    if (
      event.pointerType === "touch" ||
      event.buttons ||
      active() ||
      (event.target instanceof Element &&
        event.target.closest("[data-canvas-control],.canvas-handle"))
    ) {
      point = null;
      clear();
      return;
    }
    point = { x: event.clientX, y: event.clientY };
    schedule();
  }
  function leave() {
    pressed = null;
    point = null;
    clear();
  }
  function down(event: PointerEvent) {
    if (
      !studio ||
      event.button !== 0 ||
      event.pointerType === "touch" ||
      (event.target instanceof Element &&
        event.target.closest("[data-canvas-control],.canvas-handle"))
    ) {
      leave();
      return;
    }
    // A press is still a click candidate: keep its existing silhouette until
    // actual movement starts a drag, or release transfers it to selection.
    if (pending !== null) clock.cancel(pending);
    pending = null;
    point = null;
    pressed = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function up(event: PointerEvent) {
    const owner = pressed;
    if (!owner || event.pointerId !== owner.id) return;
    // Native selection publishes during pointerup. Retire only our lease after
    // those synchronous listeners, so no empty hover/selection state is exposed.
    queueMicrotask(() => {
      if (pressed !== owner) return;
      pressed = null;
      clear();
    });
  }
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerleave", leave);
  node.addEventListener("pointerdown", down, true);
  node.addEventListener("pointerup", up, true);
  node.addEventListener("pointercancel", leave, true);
  window.addEventListener("blur", leave);
  const stopScene = controller.subscribe(schedule),
    stopView = view.subscribe(schedule),
    stopPrepared = subscribePreparedPicking(controller, schedule);
  return () => {
    leave();
    stopScene();
    stopView();
    stopPrepared();
    node.removeEventListener("pointermove", move);
    node.removeEventListener("pointerleave", leave);
    node.removeEventListener("pointerdown", down, true);
    node.removeEventListener("pointerup", up, true);
    node.removeEventListener("pointercancel", leave, true);
    window.removeEventListener("blur", leave);
  };
}
