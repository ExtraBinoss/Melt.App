import type { EnginePort } from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import { sourceGeometry } from "../selection/frame-geometry";
import { canvasHit, canvasHits, canvasSelectionHit } from "../selection/hit";
import type { Point } from "../viewport/view";
import type { Tool } from "./gestures";

const handledPointers = new WeakSet<Event>();

/** Native camera/object controls own the gesture while document overlays still see input. */
export function markCanvasPointerHandled(event: Event) {
  handledPointers.add(event);
}

export function canvasPointerAdmitted(event: { nativeEvent: Event; button: number }) {
  return !handledPointers.has(event.nativeEvent) && event.button >= 0 && event.button <= 2;
}

/** Modified clicks use paint order; an ordinary pointer drag retains its selected target. */
export function pickCanvasPointer(
  engine: EnginePort,
  controller: SceneController,
  point: Point,
  tool: Tool,
  additive: boolean,
  studio = false,
): ReturnType<typeof canvasSelectionHit> {
  return canvasSelectionHit(
    controller.read().page,
    point,
    tool === "pointer" && !additive ? engine.getSnapshot().selection : [],
    sourceGeometry(controller),
    false,
    studio,
  );
}

/** Studio secondary drags navigate the displayed camera window, preserving authored poses. */
export function canvasPointerPans(button: number, tool: Tool, space: boolean, studio: boolean) {
  return (studio && button === 2) || (button !== 2 && (tool === "hand" || space || button === 1));
}

export function captureCanvasPointer(viewport: HTMLElement | null, pointerId: number) {
  viewport?.focus({ preventScroll: true });
  viewport?.setPointerCapture(pointerId);
}

/** Mod+Shift cycles the explicit overlap stack; Mod alone remains additive and Alt stays free. */
export function cycleCanvasPointer(
  engine: EnginePort,
  controller: SceneController,
  point: Point,
  studio = false,
) {
  const hits = canvasHits(controller.read().page, point, false, sourceGeometry(controller), studio);
  const selection = engine.getSnapshot().selection;
  const current = hits.findIndex((hit) => selection.includes(hit.layer.id));
  const candidate = hits.length ? hits[(current + 1) % hits.length] : null;
  engine.select(candidate ? [candidate.layer.id] : []);
}

/** Switching artboards uses the same unlocked artwork predicate as active-page picks. */
export function selectCanvasArtboard(
  engine: EnginePort,
  controller: SceneController,
  board: { id: string; x: number; y: number },
  worldPoint: Point,
  studio = false,
) {
  engine.setPage(board.id);
  const hit = canvasHit(
    controller.read().page,
    {
      x: worldPoint.x - board.x,
      y: worldPoint.y - board.y,
    },
    false,
    sourceGeometry(controller),
    studio,
  );
  engine.select(hit ? [hit.layer.id] : []);
}
export function isCanvasCycle(event: {
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}) {
  return event.button === 0 && event.shiftKey && (event.ctrlKey || event.metaKey) && !event.altKey;
}
