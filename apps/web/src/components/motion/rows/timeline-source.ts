import { useMemo } from "react";
import type { Composition, EnginePort } from "@musart/core";

/** Only immutable inputs that affect timeline rows or their editability. Never a deferred page. */
export type TimelineSource = Pick<
  Composition,
  "id" | "layers" | "motion" | "width" | "height" | "colorSpace" | "spatial"
>;

export function useTimelineSource(page: Composition): TimelineSource {
  const { id, layers, motion, width, height, colorSpace, spatial } = page;
  return useMemo(
    () => ({ id, layers, motion, width, height, colorSpace, spatial }),
    [id, layers, motion, width, height, colorSpace, spatial],
  );
}

/** Resolve exact canonical ownership at input time; replacement loads clone the source graph. */
export function readTimelinePage(engine: EnginePort, source: TimelineSource) {
  const snapshot = engine.getSnapshot();
  if (snapshot.pageId !== source.id) return;
  const page = snapshot.project.pages.find((item) => item.id === source.id);
  if (
    page &&
    page.layers === source.layers &&
    page.motion === source.motion &&
    page.width === source.width &&
    page.height === source.height &&
    page.colorSpace === source.colorSpace &&
    page.spatial === source.spatial
  )
    return page;
}
