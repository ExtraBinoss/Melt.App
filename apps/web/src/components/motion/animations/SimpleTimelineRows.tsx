import {
  SimpleSceneTimelineRow,
  simpleSceneRows,
  type SimpleSceneRow,
} from "../scene/SimpleSceneTimelineRow";
import { useMemo, type CSSProperties, type RefObject } from "react";
import { useReducedMotion } from "motion/react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createLayerGeometryIndex,
  motionTimeToSeconds,
  type Composition,
  type EnginePort,
  type MotionAnimation,
  type MotionLayerTrack,
  type MotionPropertyTrack,
} from "@musart/core";
import { useVirtualList } from "../../shared/scroll/use-virtual-list";
import { useEngineValue } from "../../../state/session/editor";
import { TimelineRowView } from "../rows/TimelineRowView";
import { motionPropertyLabel } from "../rows/property-label";
import { useTimelineRowHover } from "../rows/use-row-hover";
import { TrackClips } from "../occurrences/TrackClips";
import { MotionPopover } from "./MotionPopover";
import { AnimationBlock } from "./AnimationBlock";
import { MotionSummaryBlock } from "./MotionSummaryBlock";
import { SimpleAudioRows } from "./SimpleAudioRows";
import { animationPresentation, useAnimationPresentation } from "./presentation";
import type { TimelineRow } from "../tree";
import type { TimelineGestures } from "../gestures";
import type { TimelineLayerDrag } from "../layer-drag/use-timeline-layer-drag";
import type { TimelineTransport, TimelineUnit } from "../model";
import "./animations.css";

type LayerRow = Extract<TimelineRow, { kind: "layer" }>;
type Row = {
  row: LayerRow;
  track?: MotionLayerTrack;
  animation?: MotionAnimation;
  property?: MotionPropertyTrack;
};

/** Same canonical layer rows and interactions as Keyframes, with editable animation children. */
export function SimpleTimelineRows({
  engine,
  page,
  transport,
  scale,
  gutter,
  interactive,
  viewport,
  layerRows,
  rowHeight,
  onToggle,
  onSelect,
  gestures,
  drag,
  onError,
  unit,
}: {
  engine: EnginePort;
  page: Composition;
  transport: TimelineTransport;
  scale: number;
  gutter: number;
  interactive: boolean;
  viewport: RefObject<HTMLDivElement | null>;
  layerRows: readonly TimelineRow[];
  rowHeight: number;
  onToggle(this: void, id: string): void;
  onSelect(this: void, id: string, additive: boolean): void;
  gestures: TimelineGestures;
  drag: TimelineLayerDrag;
  onError(this: void, message: string): void;
  unit: TimelineUnit;
}) {
  const { t } = useTranslation("animations");
  const { t: motionLabel } = useTranslation("motion"),
    { t: common } = useTranslation();
  const presentation = useAnimationPresentation(engine),
    reduced = !!useReducedMotion();
  const { showHover, clearHover } = useTimelineRowHover(engine, page.id);
  const selection = useEngineValue(engine, (snapshot) => snapshot.selection);
  const selected = useMemo(() => new Set(selection), [selection]);
  const geometry = useMemo(() => createLayerGeometryIndex(page), [page]);
  const rows = useMemo(
    () =>
      layerRows.flatMap<Row | SimpleSceneRow>((row) => {
        if (row.kind === "scene") return simpleSceneRows(row);
        if (row.kind !== "layer") return [];
        return [
          { row },
          ...(row.expanded
            ? (row.occurrences ?? []).flatMap((track) => [
                ...(track.animations ?? []).map((animation) => ({ row, track, animation })),
                ...track.properties
                  .filter((property) => property.keyframes.length)
                  .map((property) => ({ row, track, property })),
              ])
            : []),
        ];
      }),
    [layerRows],
  );
  const audioCount = page.motion?.audioTracks?.length ?? 0;
  const { first, last } = useVirtualList(rows.length + audioCount, rowHeight, viewport, 4);
  const duration = motionTimeToSeconds(page.motion!.duration);
  return (
    <div
      className="motion-simple-rows motion-row-space"
      style={
        {
          "--motion-gutter": `${gutter}px`,
          "--motion-simple-row-height": `${rowHeight}px`,
          height: Math.max(140, (rows.length + audioCount) * rowHeight),
        } as CSSProperties
      }
      aria-label={t("title")}
    >
      {rows.slice(first, last).map((entry, offset) => {
        if ("sceneRow" in entry)
          return (
            <SimpleSceneTimelineRow
              key={entry.animation?.id ?? entry.property?.id ?? entry.sceneRow.key}
              entry={entry}
              top={(first + offset) * rowHeight}
              height={rowHeight}
              engine={engine}
              page={page}
              transport={transport}
              gestures={gestures}
              interactive={interactive}
              onToggle={onToggle}
              scale={scale}
              selected={presentation.selected}
            />
          );
        const { row, animation, track, property } = entry;
        const layer = row.layer,
          locked = geometry.isLocked(layer.id),
          top = (first + offset) * rowHeight;
        const disabled = !interactive || locked;
        if (property && track) {
          const propertyRow: TimelineRow = {
            ...row,
            kind: "property",
            key: property.id,
            property,
            track,
            depth: row.depth + 1,
          };
          return (
            <TimelineRowView
              key={property.id}
              row={propertyRow}
              top={top}
              height={rowHeight}
              reduced={reduced}
              active={selected.has(layer.id)}
              locked={locked}
              page={page}
              project={engine.getSnapshot().project}
              pixelsPerSecond={scale}
              duration={duration}
              left={0}
              width={duration * scale}
              unit={unit}
              transport={transport}
              onToggle={onToggle}
              onSelect={onSelect}
              engine={engine}
              compositionId={page.id}
              interactive={interactive}
              drag={drag}
              gestures={gestures}
              onError={onError}
              showHover={showHover}
              clearHover={clearHover}
              labelsOnly
              lane={
                <MotionSummaryBlock
                  engine={engine}
                  layerId={layer.id}
                  label={motionPropertyLabel(property.target, layer, motionLabel, common)}
                  keys={property.keyframes}
                  gestures={gestures}
                  scale={scale}
                  disabled={disabled}
                  onSelect={() => animationPresentation(engine).set({ selected: null })}
                  onDetails={() =>
                    animationPresentation(engine).set({ details: true, selected: null })
                  }
                />
              }
            />
          );
        }
        if (!animation || !track)
          return (
            <TimelineRowView
              key={row.key}
              row={row}
              top={top}
              height={rowHeight}
              reduced={reduced}
              active={selected.has(layer.id)}
              locked={locked}
              page={page}
              project={engine.getSnapshot().project}
              pixelsPerSecond={scale}
              duration={duration}
              left={0}
              width={duration * scale}
              unit={unit}
              transport={transport}
              onToggle={onToggle}
              onSelect={onSelect}
              engine={engine}
              compositionId={page.id}
              interactive={interactive}
              drag={drag}
              gestures={gestures}
              onError={onError}
              showHover={showHover}
              clearHover={clearHover}
              labelsOnly
              action={
                <MotionPopover
                  engine={engine}
                  compositionId={page.id}
                  layerId={layer.id}
                  trackId={row.track?.id}
                  transport={transport}
                  disabled={disabled}
                />
              }
              lane={
                <TrackClips
                  page={page}
                  engine={engine}
                  layerId={layer.id}
                  name={layer.name}
                  tracks={row.occurrences ?? []}
                  chosenId={row.track?.id}
                  duration={duration}
                  scale={scale}
                  disabled={disabled}
                  unit={unit}
                  gestures={gestures}
                  drag={drag}
                  transport={transport}
                  onSelect={onSelect}
                  onError={onError}
                />
              }
            />
          );
        const key = animation.id;
        return (
          <div
            key={key}
            className={`motion-row is-property ${selected.has(layer.id) ? "is-selected" : ""}`}
            style={{ top, height: rowHeight }}
            data-layer-id={layer.id}
            data-layer-kind={layer.kind}
            data-motion-hover-layer={layer.id}
            data-motion-animation-row={animation.id}
            onPointerEnter={(event) => showHover(key, layer.id, event.currentTarget)}
            onPointerLeave={(event) => {
              if (!event.currentTarget.contains(document.activeElement)) clearHover(key);
            }}
            onFocus={(event) => showHover(key, layer.id, event.currentTarget)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                clearHover(key);
            }}
          >
            <div className="motion-row-label" style={{ paddingLeft: 24 + (row.depth + 1) * 14 }}>
              <Sparkles size={11} aria-hidden />
              <button
                type="button"
                className="motion-row-name"
                disabled={!interactive}
                title={animation.preset.name}
                onClick={(event) => {
                  onSelect(layer.id, event.shiftKey);
                  animationPresentation(engine).set({ selected: animation.id });
                }}
              >
                {animation.preset.name}
              </button>
            </div>
            <div className="motion-row-time">
              <AnimationBlock
                engine={engine}
                animation={animation}
                layerId={layer.id}
                scale={scale}
                selected={presentation.selected === animation.id}
                disabled={disabled}
                transport={transport}
                page={page}
                trackId={track.id}
                gestures={gestures}
              />
            </div>
          </div>
        );
      })}
      <SimpleAudioRows
        first={Math.max(0, first - rows.length)}
        last={Math.max(0, last - rows.length)}
        top={rows.length * rowHeight}
        rowHeight={rowHeight}
        engine={engine}
        page={page}
        transport={transport}
        scale={scale}
        interactive={interactive}
      />
    </div>
  );
}
