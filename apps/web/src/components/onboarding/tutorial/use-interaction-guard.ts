import { useLayoutEffect, useRef } from "react";
import { steps } from "./content";

/** Only the lesson's native control and guide navigation accept user input. */
export function useInteractionGuard(index: number, layerId?: string) {
  const held = useRef(new Set<number>());
  useLayoutEffect(() => {
    const step = steps[index]!;
    const action = "action" in step ? step.action : undefined;
    const guide = () => document.querySelector<HTMLElement>(".tutorial-card");
    const control = () =>
      action === "select" && layerId
        ? document.querySelector<HTMLElement>(
            `.layers-panel [data-layer-id="${CSS.escape(layerId)}"]`,
          )
        : action
          ? document.querySelector<HTMLElement>(
              action === "effectMenu" ? ".layer-create-actions button" : step.target,
            )
          : undefined;
    const inGuide = (target: EventTarget | null) =>
      target instanceof Node && !!guide()?.contains(target);
    const inControl = (target: EventTarget | null) => {
      const root = control();
      if (!(target instanceof Node) || !root?.contains(target)) return false;
      // Selecting Lake must not activate its Lock/Hide buttons.
      return action !== "select" || !(target instanceof Element) || !target.closest("button");
    };
    const inResize = (target: EventTarget | null) =>
      ["pin", undefined].includes(action) &&
      (action === "pin" || step.id === "timeline") &&
      target instanceof Element &&
      !!target.closest(".motion-resize");
    const stop = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const pointer = (event: Event) => {
      if (!event.isTrusted) return; // Next uses the actual controls programmatically.
      if (event instanceof PointerEvent && event.type === "pointerdown")
        held.current.delete(event.pointerId);
      if (
        event instanceof PointerEvent &&
        (event.type === "pointerup" || event.type === "pointercancel") &&
        held.current.delete(event.pointerId)
      )
        return;
      if (event.type === "wheel" || event.type.startsWith("drag") || event.type === "drop") {
        stop(event);
        return;
      }
      if (inGuide(event.target)) {
        // Keep Radix outside-pointer/focus dismissal from observing guide presses.
        // Native click still activates the guide's buttons after pointer release.
        if (["pointerdown", "mousedown", "contextmenu"].includes(event.type)) stop(event);
        return;
      }
      if (inResize(event.target)) {
        if (event instanceof PointerEvent && event.type === "pointerdown")
          held.current.add(event.pointerId);
        return;
      }
      if (action === "context" && event instanceof MouseEvent && event.button === 2) {
        const box = control()?.getBoundingClientRect();
        if (
          box &&
          event.target instanceof Element &&
          event.target.closest(".editor-canvas") &&
          event.clientX >= box.x &&
          event.clientX <= box.right &&
          event.clientY >= box.y &&
          event.clientY <= box.bottom
        ) {
          if (event instanceof PointerEvent && event.type === "pointerdown")
            held.current.add(event.pointerId);
          return;
        }
      } else if (
        action !== "context" &&
        inControl(event.target) &&
        (!(event instanceof MouseEvent) || event.button <= 0)
      ) {
        if (action === "select" && event instanceof PointerEvent && event.type === "pointerdown")
          held.current.add(event.pointerId);
        return;
      }
      stop(event);
    };
    const keys = (event: KeyboardEvent) => {
      if (!event.isTrusted) return;
      if (event.type === "keydown" && event.key === "Tab") {
        stop(event);
        const root = control();
        const controls = root && action !== "context" ? [root] : [];
        const buttons = [
          ...(guide()?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
        ];
        const choices = [...controls, ...buttons].filter(
          (node) =>
            node.matches("button,input,[tabindex]") &&
            !node.hasAttribute("disabled") &&
            node.getBoundingClientRect().width > 0,
        );
        const current = choices.indexOf(document.activeElement as HTMLElement);
        choices[(current + (event.shiftKey ? -1 : 1) + choices.length) % choices.length]?.focus({
          preventScroll: true,
        });
        return;
      }
      const activation =
        ["Enter", " "].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey;
      if (inGuide(event.target) && activation) {
        event.stopImmediatePropagation();
        return;
      }
      if (inControl(event.target) && action !== "context" && activation) return;
      if (inResize(event.target) && ["ArrowUp", "ArrowDown"].includes(event.key)) return;
      stop(event);
    };
    const focus = (event: FocusEvent) => {
      if (inGuide(event.target)) {
        event.stopImmediatePropagation();
        return;
      }
      if (inControl(event.target) || inResize(event.target)) return;
      // Real popup autofocus must settle even when its first field is not the task.
      if (
        event.target instanceof Element &&
        event.target.closest(
          '.effect-catalog-menu,[data-slot="dropdown-menu-content"],.motion-animation-popover,.export-dialog',
        )
      )
        return;
      event.stopImmediatePropagation();
      guide()
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus({ preventScroll: true });
    };
    const events = [
      "pointerdown",
      "pointerup",
      "pointercancel",
      "pointermove",
      "pointerover",
      "pointerout",
      "pointerenter",
      "pointerleave",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "contextmenu",
      "wheel",
      "dragstart",
      "dragenter",
      "dragover",
      "dragleave",
      "drop",
    ];
    for (const name of events)
      window.addEventListener(name, pointer, { capture: true, passive: false });
    window.addEventListener("keydown", keys, true);
    window.addEventListener("keyup", keys, true);
    window.addEventListener("focusin", focus, true);
    return () => {
      for (const name of events) window.removeEventListener(name, pointer, true);
      window.removeEventListener("keydown", keys, true);
      window.removeEventListener("keyup", keys, true);
      window.removeEventListener("focusin", focus, true);
    };
  }, [index, layerId]);
}
