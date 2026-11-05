import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { EnginePort } from "@musart/core";
import { cancelLibraryDrop } from "../../services/assets/library-drag";
import { createCanvasTransfers, type CanvasTransfersOptions } from "./transfers";

/** Native cancellation ends feedback; editor disposal rejects pending library insertion. */
export function watchCanvasLibraryDrop(engine: EnginePort, reset: () => void) {
  window.addEventListener("dragend", reset);
  window.addEventListener("drop", reset);
  return () => {
    window.removeEventListener("dragend", reset);
    window.removeEventListener("drop", reset);
    cancelLibraryDrop(engine);
  };
}

/** Preserve one transfer session while React publishes feedback or changes parent callbacks. */
export function useCanvasTransfers(options: CanvasTransfersOptions) {
  const latest = useRef(options);
  const engine = options.engine;
  useLayoutEffect(() => {
    latest.current = options;
  });
  const transfers = useMemo(
    () =>
      createCanvasTransfers({
        engine,
        readPage: () => latest.current.readPage(),
        readWorkspace: () => latest.current.readWorkspace(),
        readView: () => latest.current.readView(),
        readViewport: () => latest.current.readViewport(),
        onActive: (active) => latest.current.onActive(active),
        onFiles: (files) => latest.current.onFiles?.(files),
        onError: (message) => latest.current.onError?.(message),
        onLibraryDrop: () => latest.current.onLibraryDrop?.(),
        get allowOutsideActive() {
          return latest.current.allowOutsideActive;
        },
      }),
    [engine],
  );
  useEffect(() => watchCanvasLibraryDrop(engine, transfers.reset), [engine, transfers]);
  return transfers;
}
