import { useEffect, type RefObject } from "react";
import type { EnginePort } from "@musart/core";
import { steps } from "./content";

/** Open the actual editor surface before asking the learner to use its controls. */
export function useStepSurface(
  engine: EnginePort,
  index: number,
  active: boolean,
  practice: RefObject<{ layerId: string } | null>,
) {
  useEffect(() => {
    const step = steps[index]!;
    const layerId = practice.current?.layerId;
    if (!active || !("action" in step) || !["dither", "pop"].includes(step.action)) return;
    let frame = 0;
    let ready = false;
    if (step.action === "pop" && layerId) engine.select([layerId]);
    const prepare = () => {
      frame = 0;
      if (ready) return;
      if (step.action === "dither") {
        if (document.querySelector('.effect-catalog[data-effect-category="effect"]')) {
          ready = true;
          document
            .querySelector<HTMLInputElement>('.effect-catalog[data-effect-category="effect"] input')
            ?.focus({ preventScroll: true });
          return;
        }
        const category = document.querySelector<HTMLElement>(
          '[data-effect-menu-category="effect"]',
        );
        if (category) {
          if (category.getAttribute("aria-expanded") !== "true") category.click();
        } else {
          const trigger = document.querySelector<HTMLButtonElement>(
            '.layer-create-actions button[aria-haspopup="menu"]',
          );
          if (trigger && trigger.getAttribute("data-state") !== "open") {
            trigger.dispatchEvent(
              new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }),
            );
            trigger.dispatchEvent(
              new PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "mouse" }),
            );
          }
        }
      } else {
        if (document.querySelector(".animation-picker")) {
          document.querySelector<HTMLButtonElement>('[data-animation-category="scale"]')?.click();
          ready = true;
          return;
        }
        const trigger = document.querySelector<HTMLButtonElement>(
          ".layer-animations .section-title button",
        );
        if (trigger && trigger.getAttribute("data-state") !== "open") {
          trigger.scrollIntoView({ block: "nearest" });
          trigger.click();
        }
      }
    };
    const schedule = () => {
      if (!ready && !frame) frame = requestAnimationFrame(prepare);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [engine, index, active, practice]);
}
