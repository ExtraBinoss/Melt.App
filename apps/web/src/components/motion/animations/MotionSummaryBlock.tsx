import { useRef, useState, type ReactElement, type ReactNode } from "react";
import {
  compareMotionTime,
  motionTimeToSeconds,
  type EnginePort,
  type MotionKeyframe,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import type { TimelineGestures } from "../gestures";
import { useBlockPreview } from "./use-block-preview";

/** Presets and directly authored channels use the same selection, snapping and undoable gestures. */
export function MotionSummaryBlock({
  engine,
  layerId,
  label,
  keys,
  gestures,
  scale,
  disabled,
  selected,
  enabled = true,
  onSelect,
  onDetails,
  onActivate,
  onDelete,
  animationId,
  wrap,
}: {
  engine: EnginePort;
  layerId?: string;
  label: string;
  keys: readonly MotionKeyframe[];
  gestures: TimelineGestures;
  scale: number;
  disabled: boolean;
  selected?: boolean;
  enabled?: boolean;
  animationId?: string;
  wrap?(this: void, control: ReactElement): ReactNode;
  onSelect(this: void): void;
  onDetails(this: void): void;
  onActivate?(this: void): void;
  onDelete?(this: void): void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState(false);
  const { t } = useTranslation("animations");
  useBlockPreview(ref, keys, gestures, scale);
  if (!keys.length) return null;
  const first = keys[0]!,
    last = keys[keys.length - 1]!;
  const start = motionTimeToSeconds(first.time),
    duration = motionTimeToSeconds(last.time) - start;
  const choose = () => {
    engine.select(layerId ? [layerId] : []);
    gestures.selectKeys(
      keys.map((key) => key.id),
      false,
    );
    onSelect();
    onActivate?.();
  };
  const control = (
    <button
      ref={ref}
      className="motion-animation-block motion-summary-block"
      type="button"
      data-animation-id={animationId}
      data-selected={selected || undefined}
      data-disabled={!enabled}
      aria-label={`${label}, ${Math.round(duration * 1000)} ms`}
      disabled={disabled}
      style={{ left: start * scale, width: Math.max(5, duration * scale) }}
      onPointerDown={(event) => {
        if (event.button !== 0 || disabled) return;
        const edge = (event.target as HTMLElement).dataset.edge;
        const moving =
          edge === "start"
            ? keys.filter((key) => compareMotionTime(key.time, first.time) === 0)
            : edge === "end"
              ? keys.filter((key) => compareMotionTime(key.time, last.time) === 0)
              : keys;
        gestures.beginKey(
          event,
          layerId,
          moving[0]!,
          moving.map((key) => key.id),
        );
        onSelect();
      }}
      onClick={(event) => {
        if (gestures.consumePointerClick(event.detail)) return;
        if (!event.detail) choose();
        else {
          onSelect();
          onActivate?.();
        }
      }}
      onDoubleClick={onDetails}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          choose();
          return;
        }
        const deleting = event.key === "Delete" || event.key === "Backspace";
        if (!deleting && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        try {
          if (deleting) {
            if (onDelete) onDelete();
            else {
              gestures.selectKeys(
                keys.map((key) => key.id),
                false,
              );
              gestures.deleteSelected();
            }
          } else
            engine.execute({
              type: "moveMotionKeyframes",
              keyframeIds: keys.map((key) => key.id),
              delta: {
                value: (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 100 : 10),
                rate: 1000,
              },
            });
          setError(false);
        } catch {
          setError(true);
        }
      }}
    >
      <span>{error ? t("applyFailed") : duration * scale > 80 ? label : ""}</span>
      {keys.length > 1 && (
        <>
          <span className="animation-block-edge" data-edge="start" />
          <span className="animation-block-edge" data-edge="end" />
        </>
      )}
    </button>
  );
  return wrap ? wrap(control) : control;
}
