import { tutorialError } from "./errors";
import { useEffect, useRef, type RefObject } from "react";
import type { EnginePort } from "@musart/core";
import { performStep, stepDone, waitForTutorial } from "./actions";
import { steps, type TutorialAction } from "./content";
import { visible } from "./surfaces";

/** Recover a previously shown parent after an exit confirmation or owner remount. */
export function useSurfaceRecovery(
  engine: EnginePort,
  index: number,
  active: boolean,
  practice: RefObject<{ projectId: string; layerId: string } | null>,
  onError: (message: string) => void,
) {
  const acquired = useRef({ index: -1, seen: false });
  useEffect(() => {
    if (acquired.current.index !== index) acquired.current = { index, seen: false };
    if (!active || !practice.current) return;
    const step = steps[index]!;
    const action = "action" in step ? step.action : undefined;
    let parent: { selector: string; action: TutorialAction } | undefined;
    if (action === "effectCategory")
      parent = { selector: '[data-effect-menu-category="effect"]', action: "effectMenu" };
    if (action === "dither")
      parent = {
        selector: '.effect-catalog[data-effect-category="effect"]',
        action: "effectCategory",
      };
    if (action === "transition")
      parent = { selector: '[data-tutorial="add-transition"]', action: "context" };
    if (action === "pop") parent = { selector: ".animation-picker", action: "transition" };
    if (step.id === "exportWindow" || action === "video" || action === "render")
      parent = { selector: '.export-dialog[data-state="open"]', action: "export" };
    if (!parent) return;
    const surface = parent;
    const context = { engine, ...practice.current };
    const controller = new AbortController();
    let frame = 0;
    let recovering = false;
    let handingOff = false;
    const activate = (event: MouseEvent) => {
      if (
        action === "transition" &&
        event.target instanceof Element &&
        event.target.closest('[data-tutorial="add-transition"]')
      )
        handingOff = true;
    };
    const check = () => {
      frame = 0;
      if (controller.signal.aborted || engine.getSnapshot().project.id !== context.projectId)
        return;
      if (visible(surface.selector)) {
        acquired.current.seen = true;
        return;
      }
      // The image menu intentionally retires before its animation picker mounts.
      // Reopening it during that handoff cancels the captured native menu action.
      if (
        !acquired.current.seen ||
        recovering ||
        handingOff ||
        (action && stepDone(action, context))
      )
        return;
      recovering = true;
      void (async () => {
        await performStep(surface.action, context, controller.signal);
        await waitForTutorial(context, () => !!visible(surface.selector), controller.signal);
        if (action === "pop")
          visible<HTMLButtonElement>('[data-animation-category="scale"]')?.click();
      })()
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            onError(
              error instanceof Error ? error.message : tutorialError("restoreSurface").message,
            );
        })
        .finally(() => {
          recovering = false;
        });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            !(record.target instanceof Element) || !record.target.closest(".tutorial-overlay"),
        )
      )
        schedule();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    const stop = engine.subscribe(schedule);
    document.addEventListener("click", activate, true);
    schedule();
    return () => {
      controller.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      stop();
      document.removeEventListener("click", activate, true);
    };
  }, [engine, index, active, practice, onError]);
}
