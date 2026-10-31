import type { RefObject } from "react";

/** Read screen geometry at input/resize boundaries; camera frames only use cached dimensions. */
export function createViewportMetrics(viewport: RefObject<HTMLElement | null>) {
  let bounds = { width: 0, height: 0 };
  return {
    read: () => bounds,
    measure: () => {
      const rect = viewport.current?.getBoundingClientRect();
      if (!rect) return null;
      if (rect.width !== bounds.width || rect.height !== bounds.height)
        bounds = { width: rect.width, height: rect.height };
      return rect;
    },
  };
}
