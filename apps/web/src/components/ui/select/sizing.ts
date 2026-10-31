import { createContext, type RefObject } from "react";

export const SelectAnchor = createContext<RefObject<HTMLButtonElement | null> | null>(null);

/** Match the field in both Radix positioning modes, with observers only while open. */
export function bindSelectSizing(
  trigger: HTMLButtonElement,
  content: HTMLElement,
  position: "item-aligned" | "popper",
) {
  const view = content.ownerDocument.defaultView;
  const wrapper = content.parentElement;
  if (!view || !wrapper || !content.isConnected) return () => {};
  const entrance =
    trigger
      .closest<HTMLElement>('[data-slot="dialog-content"],[data-slot="popover-content"]')
      ?.getAnimations?.() ?? [];
  let live = true;
  let frame: number | null = null;
  let measuredWidth = 0;
  let placedWidth = 0;
  let placedLeft = 0;
  const write = (style: CSSStyleDeclaration, key: string, value: string) => {
    if (style.getPropertyValue(key) !== value) style.setProperty(key, value);
  };
  function sync() {
    if (!live || !trigger.isConnected) return;
    // Read once before writing; keep invalidation within this open menu.
    const bounds = trigger.getBoundingClientRect();
    const available = Math.max(0, view!.innerWidth - 20);
    measuredWidth = bounds.width;
    const width = Math.min(bounds.width, available);
    placedWidth = width;
    const left = Math.max(10, Math.min(bounds.left, view!.innerWidth - width - 10));
    placedLeft = left;
    // CSSOM rounds fractional pixels: do not observe our own normalized style writes.
    placement.disconnect();
    write(content.style, "--select-trigger-width", `${width}px`);
    if (position === "item-aligned") {
      // Radix otherwise adds the selected text's inset to the wrapper's minimum width.
      write(wrapper!.style, "width", `${width}px`);
      write(wrapper!.style, "min-width", `${width}px`);
      write(wrapper!.style, "max-width", `${width}px`);
      write(wrapper!.style, "left", `${left}px`);
      write(wrapper!.style, "right", "auto");
      placement.observe(wrapper!, { attributes: true, attributeFilter: ["style"] });
    }
  }
  function schedule() {
    if (!live || frame !== null) return;
    frame = view!.requestAnimationFrame(() => {
      frame = null;
      sync();
      if (entrance.some((animation) => animation.playState === "running")) schedule();
    });
  }
  const resize = new ResizeObserver((entries) => {
    const width = entries[0]?.borderBoxSize[0]?.inlineSize;
    if (width === undefined || Math.abs(width - measuredWidth) > 0.01) schedule();
  });
  resize.observe(trigger, { box: "border-box" });
  // Radix can reposition when scroll buttons appear. Reapply the field bounds locally.
  const placement = new MutationObserver(() => {
    const same = (key: string, value: number) =>
      Math.abs(parseFloat(wrapper.style.getPropertyValue(key)) - value) < 0.01;
    if (
      !same("width", placedWidth) ||
      !same("min-width", placedWidth) ||
      !same("max-width", placedWidth) ||
      !same("left", placedLeft) ||
      wrapper.style.right !== "auto"
    )
      schedule();
  });
  if (position === "item-aligned")
    placement.observe(wrapper, { attributes: true, attributeFilter: ["style"] });
  view.addEventListener("resize", schedule);
  sync();
  if (entrance.some((animation) => animation.playState === "running")) schedule();
  return () => {
    live = false;
    if (frame !== null) view.cancelAnimationFrame(frame);
    resize.disconnect();
    placement.disconnect();
    view.removeEventListener("resize", schedule);
  };
}
