import type { ReactNode } from "react";
import { Camera, ChevronDown, ChevronRight, Diamond, Lightbulb, Sparkles, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort } from "@musart/core";
import type { TimelineGestures } from "../gestures";
import type { TimelineTransport } from "../model";
import { animationPresetName } from "../../spatial/presentation";
import { SceneMotionPopover } from "./SceneMotionPopover";
import { scenePropertyLabel, sceneRowName } from "./presentation";
import type { SceneTimelineRow } from "./tree";

/** Native scene rows use the same gutter and canvas surface, without a reorderable layer proxy. */
export function SceneTimelineRowView({
  row,
  top,
  height,
  engine,
  transport,
  gestures,
  interactive,
  onToggle,
  labelsOnly = true,
  lane,
}: {
  row: SceneTimelineRow;
  top: number;
  height: number;
  engine: EnginePort;
  page: Composition;
  transport: TimelineTransport;
  gestures: TimelineGestures;
  interactive: boolean;
  onToggle(this: void, id: string): void;
  scale: number;
  labelsOnly?: boolean;
  lane?: ReactNode;
}) {
  const { t } = useTranslation("motion");
  const Icon =
    row.kind === "sceneProperty"
      ? Diamond
      : row.subject === "camera"
        ? Camera
        : row.subject === "environment"
          ? Sun
          : row.subject === "compositionEffect"
            ? Sparkles
            : Lightbulb;
  const name =
    row.kind === "sceneProperty"
      ? `${row.animation ? `${animationPresetName(row.animation.preset, t)} · ` : ""}${scenePropertyLabel(row.property.target, t, row.effectType)}`
      : sceneRowName(row, t);
  return (
    <div
      className={`motion-row ${row.kind === "sceneProperty" ? "is-property" : ""}`}
      style={{ top, height, pointerEvents: labelsOnly ? "none" : undefined }}
      data-motion-row-key={row.key}
      data-motion-scene-owner={row.subject}
      data-motion-effect-id={
        row.owner.kind === "compositionEffect" ? row.owner.effectId : undefined
      }
      data-motion-light-id={row.owner.kind === "light" ? row.owner.lightId : undefined}
      data-labels-only={labelsOnly || undefined}
      data-motion-property-id={row.kind === "sceneProperty" ? row.property.id : undefined}
    >
      <div
        className="motion-row-label"
        style={{ paddingLeft: 10 + row.depth * 14, pointerEvents: "auto" }}
      >
        {row.kind === "scene" && row.expandable ? (
          <button
            type="button"
            className="motion-row-expand"
            disabled={!interactive}
            aria-expanded={row.expanded}
            aria-label={t(row.expanded ? "collapse" : "expand", { name })}
            onClick={() => onToggle(row.key)}
          >
            {row.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="motion-row-expand" aria-hidden />
        )}
        <Icon size={row.kind === "sceneProperty" ? 10 : 12} aria-hidden />
        <button
          type="button"
          className="motion-row-name"
          disabled={!interactive}
          title={name}
          aria-label={row.kind === "sceneProperty" ? t("selectPropertyKeys", { name }) : name}
          onClick={(event) => {
            if (!event.shiftKey) engine.select([]);
            if (row.kind === "sceneProperty")
              gestures.selectKeys(
                row.property.keyframes.map((key) => key.id),
                event.shiftKey,
              );
          }}
        >
          {name}
        </button>
        {row.kind === "scene" && (
          <SceneMotionPopover
            engine={engine}
            owner={row.owner}
            transport={transport}
            disabled={!interactive}
          />
        )}
      </div>
      {lane !== undefined && (
        <div className="motion-row-time" style={{ pointerEvents: "auto" }}>
          {lane}
        </div>
      )}
    </div>
  );
}
