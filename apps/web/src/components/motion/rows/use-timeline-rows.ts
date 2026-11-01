import { useMemo } from "react";
import type { EnginePort } from "@musart/core";
import { projectSceneTimelineRows } from "../scene/tree";
import type { TimelineRow } from "../tree";
import { readTimelinePage, type TimelineSource } from "./timeline-source";

/** Scene projection consumes the same retained canonical inputs as layer projection. */
export function useTimelineRows(
  engine: EnginePort,
  source: TimelineSource,
  layers: readonly TimelineRow[],
  collapsed: ReadonlySet<string>,
  details: boolean,
) {
  return useMemo(() => {
    const page = readTimelinePage(engine, source);
    return page ? [...layers, ...projectSceneTimelineRows(page, collapsed, details)] : [];
  }, [engine, source, layers, collapsed, details]);
}
