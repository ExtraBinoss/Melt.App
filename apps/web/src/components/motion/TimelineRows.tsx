import { SceneTimelineRowView } from "./scene/SceneTimelineRowView";
import { useMemo } from "react";
import { useReducedMotion } from "motion/react";
import { createLayerGeometryIndex, type EnginePort } from "@musart/core";
import type { TimelineTransport, TimelineUnit } from "./model";
import type { TimelineRow } from "./tree";
import type { TimelineGestures } from "./gestures";
import { useTimelineRowHover } from "./rows/use-row-hover";
import type { TimelineLayerDrag } from "./layer-drag/use-timeline-layer-drag";
import { TimelineRowView } from "./rows/TimelineRowView";
import "./row-hover.css";
import "./layer-drag/layer-drag.css";
export function TimelineRows({
  rows,
  first,
  last,
  rowHeight,
  selected,
  pixelsPerSecond,
  duration,
  left,
  width,
  unit,
  transport,
  onToggle,
  onSelect,
  gestures,
  engine,
  compositionId,
  onError,
  onZoomRange,
  interactive = true,
  drag,
  labelsOnly = false,
}: {
  rows: readonly TimelineRow[];
  first: number;
  last: number;
  rowHeight: number;
  selected: ReadonlySet<string>;
  pixelsPerSecond: number;
  duration: number;
  left: number;
  width: number;
  unit: TimelineUnit;
  transport: TimelineTransport;
  onToggle: (id: string) => void;
  onSelect: (id: string, additive: boolean) => void;
  gestures?: TimelineGestures;
  engine?: EnginePort;
  compositionId?: string;
  onError?: (message: string) => void;
  onZoomRange?: (start: number, end: number) => void;
  interactive?: boolean;
  drag?: TimelineLayerDrag;
  labelsOnly?: boolean;
}) {
  const reduced = !!useReducedMotion();
  const dragPage = drag?.page;
  const geometry = useMemo(
    () => (dragPage ? createLayerGeometryIndex(dragPage) : null),
    [dragPage],
  );
  const { showHover, clearHover } = useTimelineRowHover(engine, compositionId);

  const snapshot = engine?.getSnapshot();
  const page = dragPage ?? snapshot?.project.pages.find((item) => item.id === compositionId);
  const keySelection = gestures?.readSelected();
  const visible = rows.slice(first, last).map((entry, offset) => ({ entry, at: first + offset }));
  if (drag?.moving)
    for (const entry of drag.window(first, last))
      if (!visible.some((item) => item.entry.key === entry.entry.key)) visible.push(entry);
  return visible.map(({ entry: row, at }) =>
    row.kind === "scene" || row.kind === "sceneProperty" ? (
      <SceneTimelineRowView
        key={row.key}
        row={row}
        top={at * rowHeight}
        height={rowHeight}
        engine={engine!}
        page={page!}
        transport={transport}
        gestures={gestures!}
        interactive={interactive}
        onToggle={onToggle}
        scale={pixelsPerSecond}
        labelsOnly={labelsOnly}
      />
    ) : (
      <TimelineRowView
        key={row.key}
        row={row}
        top={at * rowHeight}
        height={rowHeight}
        reduced={reduced}
        active={selected.has(row.layer.id)}
        locked={!!geometry?.isLocked(row.layer.id) || row.layer.locked}
        page={page}
        project={snapshot?.project}
        pixelsPerSecond={pixelsPerSecond}
        duration={duration}
        left={left}
        width={width}
        unit={unit}
        transport={transport}
        onToggle={onToggle}
        onSelect={onSelect}
        gestures={gestures}
        engine={engine}
        compositionId={compositionId}
        onError={onError}
        onZoomRange={onZoomRange}
        interactive={interactive}
        drag={drag}
        labelsOnly={labelsOnly}
        keySelection={!labelsOnly && row.kind === "property" ? keySelection : undefined}
        showHover={showHover}
        clearHover={clearHover}
      />
    ),
  );
}
