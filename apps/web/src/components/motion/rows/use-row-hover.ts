import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { EnginePort } from "@musart/core";
import { createTimelineHoverSource } from "../../../state/motion/hover";

/** Shared timeline/canvas hover ownership, including focus and virtual-row cleanup. */
export function useTimelineRowHover(engine?: EnginePort, compositionId?: string) {
  const hover = useMemo(() => (engine ? createTimelineHoverSource(engine) : null), [engine]);
  const hovered = useRef<{ key: string; node: HTMLElement; clear(): void } | null>(null);
  const clearHover = useCallback((key?: string) => {
    const current = hovered.current;
    if (!current || (key !== undefined && current.key !== key)) return;
    hovered.current = null;
    delete current.node.dataset.motionHovered;
    current.clear();
  }, []);
  const showHover = useCallback(
    (key: string, layerId: string, node: HTMLElement) => {
      if (
        hovered.current?.key === key &&
        hovered.current.node === node &&
        (!hover || hover.read()?.layerId === layerId)
      )
        return;
      const clear = hover && compositionId ? hover.show(compositionId, layerId) : () => {};
      clearHover();
      node.dataset.motionHovered = "true";
      hovered.current = { key, node, clear };
    },
    [hover, compositionId, clearHover],
  );
  useLayoutEffect(() => {
    if (hovered.current && !hovered.current.node.isConnected) clearHover();
  });
  useEffect(() => () => clearHover(), [clearHover, hover, compositionId]);

  return { showHover, clearHover };
}
