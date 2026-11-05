import { useLayoutEffect } from "react";
import type { RefObject } from "react";
import type { WorkspaceNoticePlacement } from "../../ui/brand/notice-placement";

/** A portaled notice follows the canvas-local feedback anchor without changing page styles. */
export function useNoticeAnchor(
  anchor: RefObject<HTMLDivElement | null>,
  visible: boolean,
  placement: WorkspaceNoticePlacement,
): void {
  useLayoutEffect(() => {
    const element = anchor.current,
      target = document.querySelector<HTMLElement>(".history-notice-anchor"),
      workspace = target?.closest<HTMLElement>(".workspace"),
      objectBar = workspace?.querySelector<HTMLElement>(".studio-object-bar-anchor");
    if (!visible || !element || !target || !workspace) return;
    const paint = () => {
      const bounds = target.getBoundingClientRect();
      // All geometry reads precede the writes, which affect this portal alone.
      const viewportWidth = window.innerWidth,
        viewportHeight = window.innerHeight;
      element.style.setProperty("--notice-center", `${bounds.left + bounds.width / 2}px`);
      element.style.setProperty("--notice-top", `${bounds.top}px`);
      element.style.setProperty("--notice-right", `${viewportWidth - bounds.right}px`);
      element.style.setProperty("--notice-bottom", `${viewportHeight - bounds.bottom}px`);
    };
    paint();
    let frame: number | undefined;
    const schedule = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paint);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(target);
    observer.observe(workspace);
    if (objectBar) observer.observe(objectBar);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
      for (const key of ["center", "top", "right", "bottom"])
        element.style.removeProperty(`--notice-${key}`);
    };
  }, [anchor, visible, placement]);
}
