import { useLayoutEffect } from "react";
import type { RefObject } from "react";
import type { WorkspaceNoticePlacement } from "../../ui/brand/notice-placement";

const OBSTACLES =
  ".studio-environment, .studio-background-dock, .canvas-timeline-toggle, .studio-object-bar-anchor, .motion-timeline-dock";

/** Read geometry together, then update only the feedback portal. Never change inherited page styles. */
export function useNoticeAnchor(
  anchor: RefObject<HTMLDivElement | null>,
  visible: boolean,
  placement: WorkspaceNoticePlacement,
): void {
  useLayoutEffect(() => {
    const element = anchor.current,
      workspace = document.querySelector<HTMLElement>(".workspace");
    if (!visible || !element || !workspace) return;
    const controls = () => [...workspace.querySelectorAll<HTMLElement>(OBSTACLES)];
    const paint = () => {
      const bounds = workspace.getBoundingClientRect(),
        viewportWidth = window.innerWidth,
        viewportHeight = window.innerHeight,
        gap = viewportWidth <= 760 ? 12 : 18,
        right = Math.max(gap, viewportWidth - bounds.right + gap),
        left = viewportWidth - right - Math.min(360, viewportWidth - 24);
      let bottom = viewportHeight - bounds.bottom + gap + 78;
      for (const control of controls()) {
        const rect = control.getBoundingClientRect();
        if (
          !control.inert &&
          !control.hidden &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > left &&
          rect.left < viewportWidth - right
        )
          bottom = Math.max(bottom, viewportHeight - rect.top + 18);
      }
      element.style.setProperty("--notice-center", `${bounds.left + bounds.width / 2}px`);
      element.style.setProperty("--notice-top", `${bounds.top + gap}px`);
      element.style.setProperty("--notice-right", `${right}px`);
      element.style.setProperty("--notice-bottom", `${bottom}px`);
    };
    let frame: number | undefined;
    const schedule = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paint);
    };
    paint();
    const observer = new ResizeObserver(schedule);
    observer.observe(workspace);
    controls().forEach((control) => observer.observe(control));
    const mutations = new MutationObserver((records) => {
      // Property-preview text updates must not cause geometry reads on every frame.
      const relevant = records.some((record) =>
        record.type === "attributes"
          ? record.target instanceof Element && record.target.matches(OBSTACLES)
          : [...record.addedNodes, ...record.removedNodes].some(
              (node) =>
                node instanceof Element &&
                (node.matches(OBSTACLES) || node.querySelector(OBSTACLES)),
            ),
      );
      if (!relevant) return;
      observer.disconnect();
      observer.observe(workspace);
      controls().forEach((control) => observer.observe(control));
      schedule();
    });
    mutations.observe(workspace, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "inert",
        "hidden",
        "data-motion-pinned",
        "data-motion-exiting",
        "data-motion-animating",
      ],
    });
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
      for (const key of ["center", "top", "right", "bottom"])
        element.style.removeProperty(`--notice-${key}`);
    };
  }, [anchor, visible, placement]);
}
