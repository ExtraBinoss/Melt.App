import { useLayoutEffect, useRef } from "react";
import type {
  ObjectSelectionPort,
  ObjectSelectionState,
} from "../../../services/selection/object/model";
/** Decode the chosen thumbnail, then allow one real paint before starting the model worker. */
export function useTargetPresentation(
  port: Pick<ObjectSelectionPort, "presented">,
  state:
    | (Pick<ObjectSelectionState, "busy" | "automatic" | "layerId" | "thumbnail"> & {
        preparingSource?: boolean;
      })
    | null,
) {
  const image = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    if (!state?.busy || !state.automatic || state.preparingSource) return;
    let disposed = false,
      first = 0,
      second = 0;
    const layerId = state.layerId;
    const acknowledge = () => {
      if (!disposed) port.presented?.(layerId);
    };
    const visibility = () => {
      if (document.hidden) acknowledge();
    };
    document.addEventListener("visibilitychange", visibility);
    const decoded = image.current?.decode?.() ?? Promise.resolve();
    void decoded
      .catch(() => {})
      .then(() => {
        if (disposed) return;
        if (document.hidden) {
          acknowledge();
          return;
        }
        first = requestAnimationFrame(() => {
          second = requestAnimationFrame(acknowledge);
        });
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [
    port,
    state?.busy,
    state?.automatic,
    state?.layerId,
    state?.thumbnail,
    state?.preparingSource,
  ]);
  return image;
}
