import { memo } from "react";
import type { EnginePort } from "@musart/core";
import { TimelineRowView, type TimelineRowViewProps } from "../rows/TimelineRowView";
import type { TimelineSource } from "../rows/timeline-source";
import { TrackClips } from "../occurrences/TrackClips";
import { MotionPopover } from "./MotionPopover";

type Props = Omit<TimelineRowViewProps, "page" | "project" | "lane" | "action" | "labelsOnly"> & {
  engine: EnginePort;
  compositionId: string;
  source: TimelineSource;
};

/** Background metadata edits keep the complete layer row subtree and its live event bindings. */
export const SimpleLayerRow = memo(function SimpleLayerRow({ source, ...props }: Props) {
  const { row, engine, transport, interactive, locked, duration, pixelsPerSecond, unit } = props;
  const disabled = !interactive || locked;
  return (
    <TimelineRowView
      {...props}
      labelsOnly
      action={
        <MotionPopover
          engine={engine}
          compositionId={source.id}
          layerId={row.layer.id}
          trackId={row.track?.id}
          transport={transport}
          disabled={disabled}
        />
      }
      lane={
        <TrackClips
          source={source}
          engine={engine}
          layerId={row.layer.id}
          name={row.layer.name}
          tracks={row.occurrences ?? []}
          chosenId={row.track?.id}
          duration={duration}
          scale={pixelsPerSecond}
          disabled={disabled}
          unit={unit}
          gestures={props.gestures}
          drag={props.drag}
          transport={transport}
          onSelect={props.onSelect}
          onError={props.onError}
        />
      }
    />
  );
});
