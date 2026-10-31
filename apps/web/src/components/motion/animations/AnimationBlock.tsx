import { useMemo } from "react";
import {
  projectAnimationProperties,
  motionTimeToSeconds,
  type EnginePort,
  type Composition,
  type MotionAnimation,
} from "@musart/core";
import { AnimationContextMenu } from "./AnimationContextMenu";
import { MotionSummaryBlock } from "./MotionSummaryBlock";
import { animationPresentation } from "./presentation";
import type { TimelineTransport } from "../model";
import type { TimelineGestures } from "../gestures";

export function AnimationBlock({
  engine,
  animation,
  layerId,
  scale,
  selected,
  disabled,
  transport,
  page,
  trackId,
  gestures,
}: {
  engine: EnginePort;
  animation: MotionAnimation;
  layerId: string;
  scale: number;
  selected: boolean;
  disabled: boolean;
  transport: TimelineTransport;
  page: Composition;
  trackId: string;
  gestures: TimelineGestures;
}) {
  const keys = useMemo(
    () =>
      projectAnimationProperties({
        id: trackId,
        layerId,
        start: animation.start,
        end: null,
        properties: [],
        animations: [animation],
      })
        .flatMap(({ property }) => property.keyframes)
        .sort((a, b) => motionTimeToSeconds(a.time) - motionTimeToSeconds(b.time)),
    [animation, trackId, layerId],
  );
  return (
    <MotionSummaryBlock
      wrap={(control) => (
        <AnimationContextMenu
          engine={engine}
          page={page}
          layerId={layerId}
          trackId={trackId}
          animation={animation}
          transport={transport}
          disabled={disabled}
        >
          {control}
        </AnimationContextMenu>
      )}
      engine={engine}
      layerId={layerId}
      animationId={animation.id}
      label={animation.preset.name}
      keys={keys}
      gestures={gestures}
      scale={scale}
      selected={selected}
      disabled={disabled}
      enabled={animation.enabled}
      onSelect={() => animationPresentation(engine).set({ selected: animation.id })}
      onDetails={() => animationPresentation(engine).set({ selected: animation.id, details: true })}
      onDelete={() => engine.execute({ type: "deleteMotionAnimation", animationId: animation.id })}
    />
  );
}
