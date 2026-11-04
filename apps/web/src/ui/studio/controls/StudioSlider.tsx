import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Slider } from "../../../components/ui/slider";

export interface StudioSliderProps {
  label: string;
  value: number;
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
  const [presentation, setPresentation] = useState({
    identity,
    disabled,
    draft: null as number | null,
  });
  if (!Object.is(presentation.identity, identity) || presentation.disabled !== disabled)
    setPresentation({ identity, disabled, draft: null });
  const setDraft = (draft: number | null) => setPresentation({ identity, disabled, draft });
  const session = useRef({ active: false, cancelled: false });
  const lastPreview = useRef<number | undefined>(undefined);
  const callbacks = useRef(props);
  useLayoutEffect(() => {
    callbacks.current = props;
  });
  useLayoutEffect(() => {
    session.current = { active: false, cancelled: false };
    return () => {
      if (session.current.active) callbacks.current.onCancel();
      session.current.active = false;
      session.current.cancelled = true;
    };
  }, [identity, disabled]);
  useEffect(
    () =>
      props.invalidation?.subscribe(() => {
        if (!session.current.active) return;
        callbacks.current.onCancel();
        session.current = { active: false, cancelled: true };
        setPresentation((current) => ({ ...current, draft: null }));
      }),
    [props.invalidation],
  );
  function begin() {
    if (disabled || !Object.is(callbacks.current.identity, identity) || session.current.active)
      return;
    session.current = { active: true, cancelled: false };
    lastPreview.current = undefined;
    callbacks.current.onStart?.();
  }
  function cancel() {
    if (session.current.active) callbacks.current.onCancel();
    session.current = { active: false, cancelled: true };
    setDraft(null);
  }
  const shown = Object.is(presentation.identity, identity) ? (presentation.draft ?? value) : value;
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return (
    <div className="studio-slider" data-canvas-control>
      <div className="studio-slider-heading">
        <label id={id}>{label}</label>
        <output aria-hidden="true">
          {shown.toFixed(digits)}
          {unit}
        </output>
      </div>
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
          if (event.button !== 0) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          begin();
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={() => {
          queueMicrotask(() => {
            if (session.current.active && Object.is(callbacks.current.identity, identity)) cancel();
          });
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) cancel();
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
          setDraft(next);
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
          // Radix can commit a keyboard step before its value-change callback.
          if (lastPreview.current !== next) callbacks.current.onPreview(next);
          session.current.active = false;
          callbacks.current.onCommit(next);
          setDraft(null);
        }}
      />
    </div>
  );
}
