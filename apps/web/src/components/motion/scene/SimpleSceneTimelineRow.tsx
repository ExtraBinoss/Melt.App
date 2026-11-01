import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  animationPropertyId,
  motionTimeToSeconds,
  type Composition,
  type EnginePort,
  type SceneMotionAnimation,
  type SceneMotionPropertyTrack,
} from "@musart/core";
import { AnimationContextMenu } from "../animations/AnimationContextMenu";
import { MotionSummaryBlock } from "../animations/MotionSummaryBlock";
import { animationPresentation } from "../animations/presentation";
import { animationPresetName } from "../../spatial/presentation";
import type { TimelineGestures } from "../gestures";
import type { TimelineTransport } from "../model";
import { SceneTimelineRowView } from "./SceneTimelineRowView";
import { scenePropertyLabel } from "./presentation";
import type { SceneTimelineRow } from "./tree";
export type SimpleSceneRow = {
  sceneRow: Extract<SceneTimelineRow, { kind: "scene" }>;
  animation?: SceneMotionAnimation;
  property?: SceneMotionPropertyTrack;
};
export function simpleSceneRows(
  row: Extract<SceneTimelineRow, { kind: "scene" }>,
): SimpleSceneRow[] {
  const derived = new Set(
    row.animations.flatMap((animation) =>
      animation.preset.channels.map((_, index) => animationPropertyId(animation.id, index)),
    ),
  );
  return [
    { sceneRow: row },
    ...(row.expanded
      ? [
          ...row.animations.map((animation) => ({ sceneRow: row, animation })),
          ...row.properties
            .filter((property) => !derived.has(property.id) && property.keyframes.length)
            .map((property) => ({ sceneRow: row, property })),
        ]
      : []),
  ];
}
export function SimpleSceneTimelineRow({
  entry,
  top,
  height,
  engine,
  page,
  transport,
  gestures,
  interactive,
  onToggle,
  scale,
  selected,
}: {
  entry: SimpleSceneRow;
  top: number;
  height: number;
  engine: EnginePort;
  page: Composition;
  transport: TimelineTransport;
  gestures: TimelineGestures;
  interactive: boolean;
  onToggle(this: void, id: string): void;
  scale: number;
  selected: string | null;
}) {
  const { t } = useTranslation("animations");
  const { sceneRow: row, animation, property } = entry;
  const keys = useMemo(
    () =>
      animation
        ? row.properties
            .filter((property) =>
              animation.preset.channels.some(
                (_, index) => property.id === animationPropertyId(animation.id, index),
              ),
            )
            .flatMap((property) => property.keyframes)
            .sort((a, b) => motionTimeToSeconds(a.time) - motionTimeToSeconds(b.time))
        : (property?.keyframes ?? []),
    [animation, property, row.properties],
  );
  if (!animation && !property)
    return (
      <SceneTimelineRowView
        row={row}
        top={top}
        height={height}
        engine={engine}
        page={page}
        transport={transport}
        gestures={gestures}
        interactive={interactive}
        onToggle={onToggle}
        scale={scale}
      />
    );
  const name = animation
    ? animationPresetName(animation.preset, t)
    : scenePropertyLabel(property!.target, t);
  const choose = () => {
    engine.select([]);
    animationPresentation(engine).set({ selected: animation?.id ?? null });
  };
  const reveal = () => {
    if (animation) animationPresentation(engine).requestEditor(animation.id);
  };
  const details = () => {
    choose();
    reveal();
    animationPresentation(engine).set({ details: true });
  };
  return (
    <div
      className="motion-row is-property"
      style={{ top, height }}
      data-motion-scene-owner={row.subject}
      data-motion-animation-row={animation?.id}
    >
      <div className="motion-row-label" style={{ paddingLeft: 38 }}>
        <Sparkles size={11} aria-hidden />
        <button
          type="button"
          className="motion-row-name"
          disabled={!interactive}
          title={name}
          onClick={() => {
            choose();
            reveal();
          }}
        >
          {name}
        </button>
      </div>
      <div className="motion-row-time">
        <MotionSummaryBlock
          engine={engine}
          label={name}
          keys={keys}
          gestures={gestures}
          scale={scale}
          disabled={!interactive}
          selected={!!animation && selected === animation.id}
          enabled={animation?.enabled}
          animationId={animation?.id}
          onSelect={choose}
          onActivate={reveal}
          onDetails={details}
          onDelete={
            animation
              ? () => engine.execute({ type: "deleteMotionAnimation", animationId: animation.id })
              : undefined
          }
          wrap={
            animation
              ? (control) => (
                  <AnimationContextMenu
                    engine={engine}
                    page={page}
                    animation={animation}
                    transport={transport}
                    disabled={!interactive}
                  >
                    {control}
                  </AnimationContextMenu>
                )
              : undefined
          }
        />
      </div>
    </div>
  );
}
