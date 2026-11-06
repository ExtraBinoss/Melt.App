import { createMotionTransport } from "../../../services/motion/transport";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  getEffectDefinition,
  getEffectParameter,
  type Effect,
  type EnginePort,
  type SessionSnapshot,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import "./sdk/placement.css";

/** One imperative two-scalar gesture, one validated commit and one history entry. */
export function EffectPositionPad({
  effect,
  engine,
  layerId,
  disabled,
  onChange,
  onStart,
  onCancel,
  onPosition,
}: {
  effect: Effect;
  engine?: EnginePort;
  layerId?: string;
  disabled: boolean;
  onChange: (patch: Partial<Effect>, preview?: boolean) => void;
  onStart?: () => void;
  onCancel?: () => void;
  onPosition?: (x: number, y: number) => void;
}) {
  const { t } = useTranslation("effectDomain");
  const dot = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{
    pointer: number;
    bounds: DOMRect;
    x: number;
    y: number;
    snapshot?: SessionSnapshot;
  } | null>(null);
  const cancel = useRef(onCancel);
  useLayoutEffect(() => {
    cancel.current = onCancel;
  }, [onCancel]);
  const fields = getEffectDefinition(effect.type).parameters;
  const x = Number(
    getEffectParameter(
      effect,
      fields.find((p) => p.key === "domainX")!,
    ),
  );
  const y = Number(
    getEffectParameter(
      effect,
      fields.find((p) => p.key === "domainY")!,
    ),
  );
  useEffect(
    () => () => {
      if (gesture.current) {
        gesture.current = null;
        cancel.current?.();
      }
    },
    [effect.id],
  );
  const patch = (x: number, y: number) => ({
    settings: { ...effect.settings, domainX: x, domainY: y },
  });
  const paint = useCallback(
    (x: number, y: number) => {
      if (dot.current) {
        dot.current.style.left = `${x * 100}%`;
        dot.current.style.top = `${y * 100}%`;
      }
      onPosition?.(x, y);
    },
    [onPosition],
  );
  useEffect(() => {
    if (!engine) return;
    const transport = createMotionTransport(engine);
    const update = () => {
      if (gesture.current) return;
      const frame = transport.readFrame();
      const live = layerId
        ? frame?.layers.find((l) => l.id === layerId)?.effects.find((e) => e.id === effect.id)
        : frame?.effects?.find((e) => e.id === effect.id);
      const current = live ?? effect;
      paint(
        Number(
          getEffectParameter(
            current,
            fields.find((p) => p.key === "domainX")!,
          ),
        ),
        Number(
          getEffectParameter(
            current,
            fields.find((p) => p.key === "domainY")!,
          ),
        ),
      );
    };
    update();
    return transport.subscribe(update);
  }, [engine, layerId, effect, fields, paint]);
  useEffect(() => {
    const stop = () => {
      const active = gesture.current;
      if (!active) return;
      gesture.current = null;
      if (button.current?.hasPointerCapture(active.pointer))
        button.current.releasePointerCapture(active.pointer);
      paint(x, y);
      cancel.current?.();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") stop();
    };
    const unsubscribe = engine?.subscribe(() => {
      const origin = gesture.current?.snapshot;
      if (!origin || !engine) return;
      const current = engine.getSnapshot();
      if (
        origin.project !== current.project ||
        origin.pageId !== current.pageId ||
        origin.selection !== current.selection
      )
        stop();
    });
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      unsubscribe?.();
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", hidden);
      stop();
    };
  }, [engine, effect.id, x, y, paint]);
  return (
    <div className="effect-position-pad" role="group" aria-label={t("position")}>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-label={t("position")}
        aria-description={t("positionHelp")}
        onKeyDown={(event) => {
          if (event.key === "Escape" && gesture.current) {
            const pointer = gesture.current.pointer;
            gesture.current = null;
            if (event.currentTarget.hasPointerCapture(pointer))
              event.currentTarget.releasePointerCapture(pointer);
            paint(x, y);
            onCancel?.();
            event.preventDefault();
            return;
          }
          const step = event.shiftKey ? 0.1 : 0.01;
          const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
          const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
          if (!dx && !dy) return;
          event.preventDefault();
          onChange(patch(Math.max(0, Math.min(1, x + dx)), Math.max(0, Math.min(1, y + dy))));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || gesture.current) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const nextX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
          const nextY = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
          gesture.current = {
            pointer: event.pointerId,
            bounds,
            x: nextX,
            y: nextY,
            snapshot: engine?.getSnapshot(),
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          onStart?.();
          paint(nextX, nextY);
          onChange(patch(nextX, nextY), true);
        }}
        onPointerMove={(event) => {
          const g = gesture.current;
          if (!g || g.pointer !== event.pointerId) return;
          g.x = Math.max(0, Math.min(1, (event.clientX - g.bounds.left) / g.bounds.width));
          g.y = Math.max(0, Math.min(1, (event.clientY - g.bounds.top) / g.bounds.height));
          paint(g.x, g.y);
          onChange(patch(g.x, g.y), true);
        }}
        onPointerUp={(event) => {
          const g = gesture.current;
          if (!g || g.pointer !== event.pointerId) return;
          gesture.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          onChange(patch(g.x, g.y), false);
        }}
        onPointerCancel={() => {
          gesture.current = null;
          paint(x, y);
          onCancel?.();
        }}
        onLostPointerCapture={() => {
          if (gesture.current) {
            gesture.current = null;
            paint(x, y);
            onCancel?.();
          }
        }}
      >
        <span ref={dot} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
      </button>
    </div>
  );
}
