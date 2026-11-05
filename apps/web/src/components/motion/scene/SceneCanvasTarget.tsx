import { Spline } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motionTimeToSeconds } from "@musart/core";
import { EasingPopover } from "../easing/EasingPopover";
import { KeyCluster } from "../KeyCluster";
import { KeyframeMarker } from "../KeyframeMarker";
import { formatTimelineTime } from "../time";
import type { CanvasTimelineTargetProps } from "../canvas/overlay-model";
import type { SceneTimelineRow } from "./tree";
import { scenePropertyLabel } from "./presentation";

/** One admitted semantic target reuses native key, cluster and easing controls. */
export function SceneCanvasTarget(
  props: CanvasTimelineTargetProps & {
    row: Extract<SceneTimelineRow, { kind: "sceneProperty" }>;
    rowIndex: number;
  },
) {
  const { t } = useTranslation("motion");
  const { row, hit } = props;
  if (hit.kind !== "key" && hit.kind !== "easing") return null;
  const model = props.model ?? props.host.readModel();
  const key = row.property.keyframes.find((key) => key.id === hit.keyId);
  if (!key) return null;
  const name = scenePropertyLabel(row.property.target, t, row.effectType);
  const select = () => props.engine.select([]);
  const count = hit.kind === "key" ? hit.afterKeyIndex - hit.firstKeyIndex : 0;
  const x = motionTimeToSeconds(key.time) * model.scale;
  return (
    <div
      className="motion-row motion-canvas-active-overlay is-property"
      data-motion-row-key={row.key}
      data-motion-scene-owner={row.subject}
      style={{ top: props.rowIndex * model.rowHeight, height: model.rowHeight }}
    >
      <span aria-hidden />
      <div className="motion-row-time" data-motion-property-id={row.property.id}>
        {hit.kind === "easing" ? (
          <EasingPopover
            engine={props.engine}
            compositionId={props.compositionId}
            property={row.property}
            destination={key}
          >
            <button
              type="button"
              className="motion-easing-segment"
              disabled={!props.interactive}
              style={{
                left: hit.bounds.x + (props.host.viewport.current?.scrollLeft ?? 0),
                width: 14,
              }}
              aria-label={t("motionEasing:edit", {
                name: `${name} · ${formatTimelineTime(key.time, props.unit)} ${props.unit}`,
              })}
            >
              <Spline size={11} aria-hidden />
            </button>
          </EasingPopover>
        ) : count > 1 ? (
          <KeyCluster
            keys={row.property.keyframes}
            first={hit.firstKeyIndex}
            after={hit.afterKeyIndex}
            propertyId={hit.propertyId}
            name={name}
            x={x}
            unit={props.unit}
            gestures={props.gestures}
            transport={props.transport}
            onSelectLayer={select}
            onZoomRange={props.onZoomRange}
          />
        ) : (
          <KeyframeMarker
            marker={{
              key,
              count: 1,
              x,
              firstKeyIndex: hit.firstKeyIndex,
              afterKeyIndex: hit.afterKeyIndex,
            }}
            name={name}
            propertyId={hit.propertyId}
            unit={props.unit}
            transport={props.transport}
            gestures={props.gestures}
            onSelect={select}
            onSelectOwner={select}
            interactive={props.interactive}
          />
        )}
      </div>
    </div>
  );
}
