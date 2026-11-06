import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Slider } from "../../../components/ui/slider";
import { useTranslation } from "react-i18next";
import { ControlHint } from "../../../components/shared/ControlHint";
import { useResetFeedback } from "../../../components/shared/use-reset-feedback";
import { Kbd } from "../../../components/ui/kbd";
import {
  gestureGain,
  gestureQuantum,
  snapNumericValue,
} from "../../../components/shared/numeric-gesture";
import "./slider.css";
import "./slider-precision.css";
import "../messages";

export interface StudioSliderProps {
  label: string;
  value: number;
  resetValue?: number | (() => number);
  min: number;
  max: number;
  step?: number;
  unit?: string;
  identity: unknown;
  disabled?: boolean;
  invalidation?: { subscribe(listener: () => void): () => void };
  onStart?: () => void;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  onCancel: () => void;
}

/** Only this leaf renders while dragging. Document and scene previews stay imperative. */
export function StudioSlider(props: StudioSliderProps) {
  const { label, value, min, max, step = 0.01, unit = "", identity, disabled } = props;
  const id = useId();
  const feedback = useRef<HTMLSpanElement>(null);
  const resetFeedback = useResetFeedback(feedback, {
    animationName: "studio-reset-shimmer",
    duration: 560,
  });
  const pending = useRef<{
    timer: ReturnType<typeof setTimeout>;
    identity: unknown;
    value: number;
  } | null>(null);
  function clearPending() {
    if (!pending.current) return false;
    clearTimeout(pending.current.timer);
    pending.current = null;
    return true;
  }
  const { t } = useTranslation("studioChrome");
  const pointer = useRef<{
    pointerId: number;
    x: number;
    startX: number;
    time: number;
    width: number;
    shift: boolean;
    moved: boolean;
    value: number;
  } | null>(null);
  const [presentation, setPresentation] = useState({
    identity,
    disabled,
    draft: null as number | null,
    snap: null as number | null,
  });
  if (!Object.is(presentation.identity, identity) || presentation.disabled !== disabled)
    setPresentation({ identity, disabled, draft: null, snap: null });
  const setDraft = (draft: number | null, snap: number | null = null) =>
    setPresentation({ identity, disabled, draft, snap });
  const session = useRef({ active: false, cancelled: false });
  const lastPreview = useRef<number | undefined>(undefined);
  const callbacks = useRef(props);
  useLayoutEffect(() => {
    callbacks.current = props;
  });
  useLayoutEffect(() => {
    session.current = { active: false, cancelled: false };
    return () => {
      const waiting = clearPending();
      if (session.current.active || waiting) callbacks.current.onCancel();
      session.current.active = false;
      session.current.cancelled = true;
      pointer.current = null;
    };
  }, [identity, disabled]);
  useEffect(
    () =>
      props.invalidation?.subscribe(() => {
        const waiting = clearPending();
        if (!session.current.active && !waiting) return;
        callbacks.current.onCancel();
        session.current = { active: false, cancelled: true };
        pointer.current = null;
        setPresentation((current) => ({ ...current, draft: null, snap: null }));
      }),
    [props.invalidation],
  );
  function begin() {
    if (disabled || !Object.is(callbacks.current.identity, identity) || session.current.active)
      return;
    clearPending();
    session.current = { active: true, cancelled: false };
    lastPreview.current = undefined;
    callbacks.current.onStart?.();
  }
  function cancel() {
    const waiting = clearPending();
    if (session.current.active || waiting) callbacks.current.onCancel();
    session.current = { active: false, cancelled: true };
    setDraft(null);
    pointer.current = null;
  }
  function flushPending() {
    const held = pending.current;
    if (!held) return;
    clearPending();
    if (!callbacks.current.disabled && Object.is(callbacks.current.identity, held.identity))
      callbacks.current.onCommit(held.value);
    else callbacks.current.onCancel();
    setDraft(null);
  }
  function reset() {
    if (disabled || !Object.is(callbacks.current.identity, identity)) return;
    const source = callbacks.current.resetValue ?? 0;
    const raw = typeof source === "function" ? source() : source;
    if (!Number.isFinite(raw)) return;
    cancel();
    const next = Math.max(min, Math.min(max, Number((Math.round(raw / step) * step).toFixed(6))));
    if (next !== callbacks.current.value) {
      callbacks.current.onStart?.();
      callbacks.current.onPreview(next);
      callbacks.current.onCommit(next);
    }
    resetFeedback();
  }
  const shown = Object.is(presentation.identity, identity) ? (presentation.draft ?? value) : value;
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return (
    <div
      className="studio-slider"
      data-canvas-control
      onDoubleClickCapture={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        reset();
      }}
    >
      <div className="studio-slider-heading">
        <label id={id}>{label}</label>
        <output aria-hidden="true">
          {shown.toFixed(digits)}
          {unit}
        </output>
      </div>
      <ControlHint
        content={
          <>
            <Kbd>⇧</Kbd>
            <span>
              {t("preciseHint")} · {t("sliderResetHint")}
            </span>
          </>
        }
      >
        <div className="studio-slider-control">
          <Slider
            tone="primary"
            aria-label={label}
            aria-labelledby={id}
            aria-valuetext={`${shown.toFixed(digits)}${unit}`}
            value={[shown]}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onPointerDownCapture={(event) => {
              if (event.button !== 0 || disabled || pointer.current) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              const width = event.currentTarget.getBoundingClientRect().width;
              begin();
              pointer.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                startX: event.clientX,
                time: event.timeStamp,
                width,
                shift: event.shiftKey,
                moved: false,
                value: shown,
              };
            }}
            onPointerMoveCapture={(event) => {
              const active = pointer.current;
              if (
                !active ||
                active.pointerId !== event.pointerId ||
                disabled ||
                !session.current.active ||
                session.current.cancelled
              )
                return;
              event.preventDefault();
              const delta = event.clientX - active.x;
              if (Math.abs(event.clientX - active.startX) >= 3) active.moved = true;
              const elapsed = event.timeStamp - active.time;
              const speed = elapsed > 0 ? Math.abs(delta) / elapsed : 1;
              active.value = Math.max(
                min,
                Math.min(
                  max,
                  active.value +
                    ((delta * (max - min)) / Math.max(1, active.width)) *
                      (event.shiftKey ? 1 : gestureGain(false, delta, elapsed)),
                ),
              );
              active.x = event.clientX;
              active.time = event.timeStamp;
              active.shift = event.shiftKey;
              const quantum = gestureQuantum(min, max, step, speed);
              const sampled = event.shiftKey
                ? {
                    value: Math.max(
                      min,
                      Math.min(
                        max,
                        Number((Math.round(active.value / quantum) * quantum).toFixed(6)),
                      ),
                    ),
                    target: null,
                  }
                : snapNumericValue(
                    active.value,
                    min,
                    max,
                    step,
                    ((max - min) * 4) / Math.max(1, active.width),
                  );
              setDraft(sampled.value, event.shiftKey ? sampled.value : sampled.target);
              lastPreview.current = sampled.value;
              callbacks.current.onPreview(sampled.value);
            }}
            onPointerCancel={cancel}
            onLostPointerCapture={() => {
              queueMicrotask(() => {
                if (session.current.active && Object.is(callbacks.current.identity, identity))
                  cancel();
              });
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                flushPending();
                cancel();
              }
            }}
            onKeyDownCapture={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancel();
              } else if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                  "PageUp",
                  "PageDown",
                ].includes(event.key)
              ) {
                begin();
              }
            }}
            onValueChange={([next]) => {
              if (
                next === undefined ||
                disabled ||
                !session.current.active ||
                session.current.cancelled ||
                !Object.is(callbacks.current.identity, identity)
              )
                return;
              let snap: number | null = null;
              const active = pointer.current;
              if (active) {
                active.value = next;
                const quantum = gestureQuantum(min, max, step, 0);
                const sampled = active.shift
                  ? {
                      value: Math.max(
                        min,
                        Math.min(max, Number((Math.round(next / quantum) * quantum).toFixed(6))),
                      ),
                      target: null,
                    }
                  : snapNumericValue(
                      next,
                      min,
                      max,
                      step,
                      ((max - min) * 4) / Math.max(1, active.width),
                    );
                next = sampled.value;
                snap = sampled.target;
              }
              setDraft(next, snap);
              lastPreview.current = next;
              callbacks.current.onPreview(next);
            }}
            onValueCommit={([next]) => {
              if (
                next === undefined ||
                disabled ||
                !session.current.active ||
                session.current.cancelled ||
                !Object.is(callbacks.current.identity, identity)
              )
                return;
              const held = pointer.current;
              if (held) next = lastPreview.current ?? shown;
              pointer.current = null;
              // Radix can commit a keyboard step before its value-change callback.
              if (lastPreview.current !== next) callbacks.current.onPreview(next);
              session.current.active = false;
              if (held && !held.moved) {
                // Keep a click's preview immediate, but admit the native double-click
                // before publishing history. A drag and keyboard steps still commit immediately.
                clearPending();
                pending.current = { identity, value: next, timer: setTimeout(flushPending, 500) };
              } else {
                callbacks.current.onCommit(next);
                setDraft(null);
              }
            }}
          />
        </div>
      </ControlHint>
      <span ref={feedback} className="studio-slider-reset-feedback" aria-hidden="true" />
      {presentation.snap !== null && (
        <span
          className="studio-slider-snap"
          aria-hidden
          style={{ left: `${((presentation.snap - min) / (max - min)) * 100}%` }}
        />
      )}
    </div>
  );
}
