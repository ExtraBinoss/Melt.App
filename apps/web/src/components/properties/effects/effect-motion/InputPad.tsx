import { useRef } from "react";
import type { PointerEvent } from "react";
import type { MotionInputKind } from "@musart/core";
import { useTranslation } from "react-i18next";
export type EffectPadInput =
  | { kind: "pointer"; x: number; y: number; dragging: boolean }
  | { kind: "primaryClick" | "secondaryClick" };

/** An explicit test surface owns input only while its recording is armed. */
export function InputPad({
  kind,
  emit,
  cancel,
}: {
  kind: MotionInputKind;
  emit(event: EffectPadInput): void;
  cancel(): void;
}) {
  const { t } = useTranslation("effectMotion");
  const point = useRef({ x: 0.5, y: 0.5 });
  const captured = useRef<number | null>(null);
  const keyboardDrag = useRef(false);
  const position = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    point.current = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  return (
    <div
      role="application"
      tabIndex={0}
      aria-label={t("pad")}
      aria-description={t("help")}
      className="effect-motion-input-pad"
      onContextMenu={(event) => {
        if (kind === "secondaryClick") event.preventDefault();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 && !(event.button === 2 && kind === "secondaryClick")) return;
        event.preventDefault();
        event.currentTarget.focus();
        position(event);
        if (event.button === 2 || kind === "primaryClick")
          emit({ kind: event.button === 2 ? "secondaryClick" : "primaryClick" });
        if (event.button !== 0) return;
        captured.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        emit({ kind: "pointer", ...point.current, dragging: true });
      }}
      onPointerMove={(event) => {
        position(event);
        emit({ kind: "pointer", ...point.current, dragging: captured.current === event.pointerId });
      }}
      onPointerUp={(event) => {
        if (event.button !== 0 || captured.current !== event.pointerId) return;
        position(event);
        // Preserve final displacement before the release/return transition.
        emit({ kind: "pointer", ...point.current, dragging: true });
        emit({ kind: "pointer", ...point.current, dragging: false });
        captured.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => {
        if (captured.current !== null) {
          captured.current = null;
          cancel();
        }
      }}
      onPointerCancel={() => {
        captured.current = null;
        cancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!event.repeat)
            emit({ kind: kind === "secondaryClick" ? "secondaryClick" : "primaryClick" });
        } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          if (!keyboardDrag.current) emit({ kind: "pointer", ...point.current, dragging: true });
          keyboardDrag.current = true;
          point.current.x = Math.max(
            0,
            Math.min(
              1,
              point.current.x +
                (event.key === "ArrowLeft" ? -0.05 : event.key === "ArrowRight" ? 0.05 : 0),
            ),
          );
          point.current.y = Math.max(
            0,
            Math.min(
              1,
              point.current.y +
                (event.key === "ArrowUp" ? -0.05 : event.key === "ArrowDown" ? 0.05 : 0),
            ),
          );
          emit({ kind: "pointer", ...point.current, dragging: true });
        }
      }}
      onKeyUp={(event) => {
        if (keyboardDrag.current && event.key.startsWith("Arrow")) {
          keyboardDrag.current = false;
          emit({ kind: "pointer", ...point.current, dragging: false });
        }
      }}
    >
      {t("padHint")}
    </div>
  );
}
