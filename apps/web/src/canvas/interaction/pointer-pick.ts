import type { EnginePort } from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import { sourceGeometry } from "../selection/frame-geometry";
import { canvasHit, canvasSelectionHit } from "../selection/hit";
import type { Point } from "../viewport/view";
import type { Tool } from "./gestures";

/** Modified clicks use paint order; an ordinary pointer drag retains its selected target. */
export function pickCanvasPointer(
  engine: EnginePort,
  controller: SceneController,
  point: Point,
  tool: Tool,
  additive: boolean,
  studio = false,
): ReturnType<typeof canvasSelectionHit> {
  if (studio)
    return canvasHit(
      controller.read().page,
      point,
      tool === "pointer",
      sourceGeometry(controller),
      true,
    );
  return canvasSelectionHit(
    controller.read().page,
    point,
    tool === "pointer" && !additive ? engine.getSnapshot().selection : [],
    sourceGeometry(controller),
    tool === "pointer",
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
