import { useEffect, type RefObject } from "react";
import type { EnginePort } from "@musart/core";
import { getCompositionPerformance } from "../../state/session/composition-performance";
import { sampleComposition } from "./sample";

/** One provider for the mounted canvas, independent of the active composition and open popovers. */
export function useCompositionProfiler(
  engine: EnginePort,
  anchor: RefObject<HTMLDivElement | null>,
) {
  useEffect(
    () =>
      getCompositionPerformance(engine).registerProfiler((id, signal) =>
        sampleComposition(
          engine,
          () =>
            anchor.current
              ?.closest(".editor-canvas")
              ?.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas") ?? null,
          id,
          signal,
        ),
      ),
    [engine, anchor],
  );
}
