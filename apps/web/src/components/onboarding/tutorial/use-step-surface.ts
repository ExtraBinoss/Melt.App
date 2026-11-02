import { acquireEffectGuide } from "../../layers/menu/effect-surface";
import { waitForTutorial } from "./actions";
import { createViewportActions } from "../../../canvas/session/viewport-actions";
import { useEffect, type RefObject } from "react";
import type { EnginePort } from "@musart/core";
import { steps } from "./content";

/** Open the actual editor surface before asking the learner to use its controls. */
export function useStepSurface(
  engine: EnginePort,
  index: number,
  active: boolean,
  practice: RefObject<{ projectId: string; layerId: string } | null>,
  onError: (message: string) => void,
) {
  useEffect(() => {
    const step = steps[index]!;
    const layerId = practice.current?.layerId;
    if (!active) return;
    if ("action" in step && step.action === "export") {
      engine.select([]);
      return;
    }
    if (
      step.title === "Back to your canvas" ||
      step.title === "Static and Motion" ||
      ("action" in step && step.action === "context")
    ) {
      if (layerId && "action" in step) engine.select([layerId]);
      document
        .querySelector<HTMLButtonElement>('[data-tutorial="timeline-pin"][aria-pressed="true"]')
        ?.click();
      createViewportActions(engine).run("fit");
      return;
    }
    if (!("action" in step) || !["dither", "pop", "motion"].includes(step.action)) return;
    if (step.action === "dither") {
      const controller = new AbortController();
      let release: (() => void) | undefined;
      if (!practice.current) return;
      void waitForTutorial(
        { engine, ...practice.current },
        () => {
          release = acquireEffectGuide(engine, "dither");
          return !!release;
        },
        controller.signal,
      ).catch((error: unknown) => {
        if (!controller.signal.aborted)
          onError(error instanceof Error ? error.message : "Could not open the effect library.");
      });
      return () => {
        controller.abort();
        release?.();
      };
    }
    let frame = 0;
    let ready = false;
    if (step.action === "pop" && layerId) engine.select([layerId]);
    const prepare = () => {
      frame = 0;
      if (ready) return;
      if (step.action === "motion") {
        const target = document.querySelector<HTMLElement>(
          '.motion-mode [data-segmented-value="motion"]',
        );
        if (!target) return;
        const box = target.getBoundingClientRect();
        ready = createViewportActions(engine).focus({
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          factor: 1.4,
        });
      } else {
        if (document.querySelector(".animation-picker")) {
          document.querySelector<HTMLButtonElement>('[data-animation-category="scale"]')?.click();
          ready = true;
          return;
        }
      }
    };
    const schedule = () => {
      if (!ready && !frame) frame = requestAnimationFrame(prepare);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-expanded"],
    });
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [engine, index, active, practice, onError]);
}
