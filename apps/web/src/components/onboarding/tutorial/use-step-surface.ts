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
    let typing: ReturnType<typeof setTimeout> | undefined;
    if (step.action === "pop" && layerId) engine.select([layerId]);
    const prepare = () => {
      frame = 0;
      if (ready) return;
      if (step.action === "dither") {
        const trigger = document.querySelector<HTMLButtonElement>(
          '.layer-create-actions button[aria-haspopup="menu"]',
        );
        if (!trigger) return;
        if (trigger.getAttribute("data-state") !== "open") {
          trigger.dispatchEvent(
            new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }),
          );
          trigger.dispatchEvent(
            new PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "mouse" }),
          );
          return;
        }
        const category = document.querySelector<HTMLElement>(
          '[data-effect-menu-category="effect"]',
        );
        if (!category) return;
        if (category.getAttribute("aria-expanded") !== "true") {
          category.click();
          return;
        }
        const input = document.querySelector<HTMLInputElement>(
          '.effect-catalog[data-effect-category="effect"] input',
        );
        if (!input || input.closest('[data-state="closed"]')) return;
        ready = true;
        input.focus({ preventScroll: true });
        const valueDescriptor = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!;
        let count = 0;
        const type = () => {
          if (!input.isConnected) return;
          count++;
          valueDescriptor.set?.call(input, "dither".slice(0, count));
          input.dispatchEvent(new Event("input", { bubbles: true }));
          if (count < 6) typing = setTimeout(type, 35);
        };
        type();
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
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-expanded"],
    });
    schedule();
    return () => {
      clearTimeout(typing);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [engine, index, active, practice]);
}
