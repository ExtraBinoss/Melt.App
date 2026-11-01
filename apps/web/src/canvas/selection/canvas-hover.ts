import type { EnginePort } from "@musart/core";
import { createTimelineHoverSource } from "../../state/motion/hover";
import type { SceneController } from "../session/scene-controller";
import { clientToPage } from "../viewport/view";
import type { ViewSource } from "../viewport/motion";
import { sourceGeometry } from "./frame-geometry";
import { canvasHit } from "./hit";

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
): () => void {
  const hover = createTimelineHoverSource(engine);
  let point: { x: number; y: number } | null = null;
  let pending: number | null = null;
  let release: (() => void) | null = null;
  let layerId: string | null = null;
  function clear() {
    if (pending !== null) clock.cancel(pending);
    pending = null;
    release?.();
    release = null;
    layerId = null;
  }
  function paint() {
    pending = null;
    if (!point || active()) {
      clear();
      return;
    }
    // Read all layout before the hover lease synchronously paints its outline.
    const rect = node.getBoundingClientRect();
    const frame = controller.read();
    const location = clientToPage(point, rect, view.read(), frame.page);
    const picked = canvasHit(frame.page, location, true, sourceGeometry(controller));
    const id = picked?.layer.id ?? null;
    if (id === layerId && hover.read()?.layerId === id) return;
    const previous = release;
    release = id ? hover.show(frame.page.id, id) : null;
    layerId = id;
    previous?.();
  }
  function schedule() {
    if (point && pending === null) pending = clock.request(paint);
  }
  function move(event: PointerEvent) {
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
    point = null;
    clear();
  }
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerleave", leave);
  node.addEventListener("pointerdown", leave, true);
  const stopScene = controller.subscribe(schedule),
    stopView = view.subscribe(schedule);
  return () => {
    leave();
    stopScene();
    stopView();
    node.removeEventListener("pointermove", move);
    node.removeEventListener("pointerleave", leave);
    node.removeEventListener("pointerdown", leave, true);
  };
}
