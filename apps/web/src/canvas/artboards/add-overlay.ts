import type { EnginePort } from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import type { ViewMotion } from "../viewport/motion";
import type { WorkspaceSource } from "./workspace";
import { artboardAt, type ArtboardWorkspace } from "./layout";
import { clientToPage, type Point } from "../viewport/view";
import { artboardInsertions, insertionButton, type ArtboardInsertion } from "./insertion";

/** Hover presentation stays outside React and owns only one canvas-level button. */
export function bindArtboardAdd(options: {
  element: HTMLElement;
  button: HTMLButtonElement;
  engine: EnginePort;
  controller: SceneController;
  workspace: WorkspaceSource;
  view: ViewMotion;
}) {
  const { element, button, engine, controller, workspace, view } = options;
  let pointer: Point | null = null,
    keyboard = false,
    frame: number | undefined;
  let current: { candidate: ArtboardInsertion; projectId: string; revision: number } | undefined;
  let geometry: ArtboardWorkspace | undefined,
    candidates: ArtboardInsertion[] = [];
  function hide() {
    current = undefined;
    if (button.dataset.visible === "false") return;
    button.dataset.visible = "false";
    button.setAttribute("aria-hidden", "true");
  }
  function paint() {
    frame = undefined;
    if ((!pointer && !keyboard) || controller.read().playback || view.isMoving()) {
      hide();
      return;
    }
    const layout = workspace.read(),
      shown = view.read(),
      snapshot = engine.getSnapshot();
    const rect = element.getBoundingClientRect();
    const point = pointer ? clientToPage(pointer, rect, shown, layout) : null;
    if (point && artboardAt(layout, point)) {
      hide();
      return;
    }
    if (geometry !== layout) {
      geometry = layout;
      candidates = artboardInsertions(layout);
    }
    const ranked = candidates
      .flatMap((candidate) => {
        const board = layout.boards.find((board) => board.id === candidate.sourceId)!;
        const target = insertionButton(candidate, layout, shown);
        if (!point)
          return keyboard && board.id === snapshot.pageId
            ? [{ candidate, target, distance: candidate.side === "right" ? 0 : 1 }]
            : [];
        const across =
          candidate.side === "top" || candidate.side === "bottom"
            ? point.x >= board.x && point.x <= board.x + board.width
            : point.y >= board.y && point.y <= board.y + board.height;
        const distance =
          candidate.side === "top"
            ? (board.y - point.y) * shown.zoom
            : candidate.side === "bottom"
              ? (point.y - board.y - board.height) * shown.zoom
              : candidate.side === "left"
                ? (board.x - point.x) * shown.zoom
                : (point.x - board.x - board.width) * shown.zoom;
        if (!across || distance < 0 || distance > 80) return [];
        return [
          {
            candidate,
            target,
            distance: Math.hypot(
              pointer!.x - rect.left - rect.width / 2 - target.x,
              pointer!.y - rect.top - rect.height / 2 - target.y,
            ),
          },
        ];
      })
      .sort((a, b) => a.distance - b.distance);
    const best = ranked[0];
    if (
      !best ||
      Math.abs(best.target.x) > rect.width / 2 - 18 ||
      Math.abs(best.target.y) > rect.height / 2 - 18
    ) {
      hide();
      return;
    }
    current = {
      candidate: best.candidate,
      projectId: snapshot.project.id,
      revision: snapshot.revision,
    };
    button.style.transform = `translate3d(${best.target.x}px,${best.target.y}px,0) translate(-50%,-50%)`;
    button.dataset.side = best.candidate.side;
    button.dataset.sourceId = best.candidate.sourceId;
    button.dataset.visible = "true";
    button.removeAttribute("aria-hidden");
  }
  function schedule() {
    if (frame === undefined) frame = requestAnimationFrame(paint);
  }
  function move(event: PointerEvent) {
    if (button.contains(event.target as Node)) return;
    keyboard = false;
    if (event.buttons || (event.target as Element).closest("[data-canvas-control]")) {
      pointer = null;
      hide();
      return;
    }
    pointer = { x: event.clientX, y: event.clientY };
    schedule();
  }
  function leave() {
    pointer = null;
    keyboard = false;
    hide();
  }
  function focus(event: FocusEvent) {
    if (event.target === element) {
      keyboard = true;
      pointer = null;
      schedule();
    }
  }
  function touch(event: PointerEvent) {
    if (event.pointerType === "touch") move(event);
  }
  const stopView = view.subscribe(schedule),
    stopEngine = engine.subscribe(schedule),
    stopScene = controller.subscribe(schedule);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerleave", leave);
  element.addEventListener("pointerup", touch);
  element.addEventListener("focusin", focus);
  window.addEventListener("blur", leave);
  hide();
  return {
    take() {
      const snapshot = engine.getSnapshot(),
        target = current;
      hide();
      return target &&
        snapshot.project.id === target.projectId &&
        snapshot.revision === target.revision &&
        !controller.read().playback
        ? target.candidate
        : undefined;
    },
    dispose() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      stopView();
      stopEngine();
      stopScene();
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("pointerup", touch);
      element.removeEventListener("focusin", focus);
      window.removeEventListener("blur", leave);
      hide();
    },
  };
}
