import { useEffect, useMemo } from "react";
import type { Composition, EnginePort } from "@musart/core";
import { sourceGeometry } from "./frame-geometry";
import { createLiveMarquee } from "./live-marquee";

/** The visible pose owns marquee geometry; this mounted canvas owns its scheduled draft. */
export function useLiveMarquee(engine: EnginePort, source: { read(): { page: Composition } }) {
  const live = useMemo(
    () =>
      createLiveMarquee(
        engine,
        {
          request: (callback) => requestAnimationFrame(callback),
          cancel: (handle) => cancelAnimationFrame(handle),
        },
        () => source.read().page,
        () => sourceGeometry(source),
      ),
    [engine, source],
  );
  useEffect(() => () => live.cancel(), [live]);
  return live;
}
