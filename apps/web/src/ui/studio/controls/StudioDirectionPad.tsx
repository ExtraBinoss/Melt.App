import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

export interface DirectionValue {
  x: number;
  y: number;
}
export interface StudioDirectionPadProps {
  label: string;
  value: DirectionValue;
  identity: unknown;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  step?: number;
  /** Project a sampled point onto the parameter domain, e.g. a unit direction. */
  projectValue?: (value: DirectionValue) => DirectionValue;
  invalidation: { subscribe(listener: () => void): () => void };
  onStart: () => void;
  onPreview: (value: DirectionValue) => void;
  onCommit: (value: DirectionValue) => void;
  onCancel: () => void;
}

/** One captured pointer owns one canonical camera draft and one atomic commit. */
export function StudioDirectionPad(props: StudioDirectionPadProps) {
  const [draft, setDraft] = useState<{ identity: unknown; value: DirectionValue } | null>(null);
  const callbacks = useRef(props);
  const active = useRef<{ pointer: number; value: DirectionValue; bounds: DOMRect } | null>(null);
  useLayoutEffect(() => {
    callbacks.current = props;
  });
  useLayoutEffect(() => {
    return () => {
      if (active.current) callbacks.current.onCancel();
      active.current = null;
    };
  }, [props.identity, props.minX, props.maxX, props.minY, props.maxY]);
  useEffect(
    () =>
      props.invalidation.subscribe(() => {
        if (!active.current) return;
        callbacks.current.onCancel();
        active.current = null;
        setDraft(null);
      }),
    [props.invalidation],
  );
  const shown = draft && draft.identity === props.identity ? draft.value : props.value;
  const { minX, maxX, minY, maxY, step = 1 } = props;
  const clampX = (value: number) => Math.max(minX, Math.min(maxX, value));
  const clampY = (value: number) => Math.max(minY, Math.min(maxY, value));
  const snap = (value: number) => Math.round(value / step) * step;
  function cancel() {
    if (!active.current) return;
    callbacks.current.onCancel();
    active.current = null;
    setDraft(null);
  }
  function sample(event: PointerEvent<HTMLButtonElement>) {
    const session = active.current;
    if (!session || session.pointer !== event.pointerId) return;
    const { bounds } = session;
    const point = {
      x: clampX(snap(minX + ((event.clientX - bounds.left) / bounds.width) * (maxX - minX))),
      y: clampY(snap(maxY - ((event.clientY - bounds.top) / bounds.height) * (maxY - minY))),
    };
    const value = callbacks.current.projectValue?.(point) ?? point;
    session.value = value;
    setDraft({ identity: props.identity, value });
    callbacks.current.onPreview(value);
  }
  return (
    <button
      type="button"
      className="studio-direction-pad"
      aria-label={props.label}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home Escape"
      onPointerDown={(event) => {
        if (event.button !== 0 || active.current) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        const bounds = event.currentTarget.getBoundingClientRect();
        callbacks.current.onStart();
        active.current = { pointer: event.pointerId, value: shown, bounds };
        event.currentTarget.setPointerCapture(event.pointerId);
        sample(event);
      }}
      onPointerMove={sample}
      onPointerUp={(event) => {
        if (event.button !== 0 || active.current?.pointer !== event.pointerId) return;
        sample(event);
        const value = active.current.value;
        active.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        callbacks.current.onCommit(value);
        setDraft(null);
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onBlur={cancel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
          return;
        }
        const increment = step * (event.shiftKey ? 10 : 1);
        const deltas: Readonly<Record<string, readonly [number, number]>> = {
          ArrowLeft: [-increment, 0],
          ArrowRight: [increment, 0],
          ArrowUp: [0, increment],
          ArrowDown: [0, -increment],
          Home: [0, 0],
        };
        const delta = deltas[event.key];
        if (!delta || active.current) return;
        event.preventDefault();
        const point =
          event.key === "Home"
            ? { x: clampX(0), y: clampY(0) }
            : {
                x: clampX(shown.x + delta[0]),
                y: clampY(shown.y + delta[1]),
              };
        const value = callbacks.current.projectValue?.(point) ?? point;
        callbacks.current.onStart();
        callbacks.current.onPreview(value);
        callbacks.current.onCommit(value);
      }}
    >
      <span className="studio-direction-origin" aria-hidden />
      <span
        className="studio-direction-position"
        aria-hidden
        style={{
          left: `${((shown.x - minX) / (maxX - minX)) * 100}%`,
          top: `${((maxY - shown.y) / (maxY - minY)) * 100}%`,
        }}
      />
    </button>
  );
}
