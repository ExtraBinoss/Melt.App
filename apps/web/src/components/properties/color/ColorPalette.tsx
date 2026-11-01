import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { HsvColorPicker, type HsvColor } from "react-colorful";
import { useTranslation } from "react-i18next";
import { Slider } from "../../ui/slider";
import { hexToHsva, hsvaToHex, type Hsva } from "./conversion";
import "./color.css";

export function ColorPalette({
  value,
  onPreview,
  onCommit,
  onCancel,
  disabled = false,
  alpha = true,
  resetKey = "",
}: {
  disabled?: boolean;
  alpha?: boolean;
  resetKey?: string;
  value: string;
  onPreview: (hex: string) => void | boolean;
  onCommit: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const origin = useMemo(() => ({ value, resetKey }), [value, resetKey]);
  const [draft, setDraft] = useState<{
    origin: typeof origin;
    color: Hsva;
  } | null>(null);
  const [cycle, setCycle] = useState(0);
  const epoch = useRef(0);
  const mounted = useRef(false);
  const color = draft?.origin === origin ? draft.color : hexToHsva(value);
  const current = useRef(color),
    pad = useRef<HTMLDivElement>(null);
  const channels = useRef<HTMLDivElement>(null);
  const pointer = useRef<{
    id: number;
    origin: typeof origin;
    box: DOMRect;
  } | null>(null);
  const samplePointer = useRef<(event: PointerEvent) => boolean>(() => false);
  useLayoutEffect(() => {
    current.current = color;
  }, [color]);
  useLayoutEffect(() => {
    pad.current
      ?.querySelector('.react-colorful__saturation [role="slider"]')
      ?.setAttribute("aria-label", t("pickerSaturation"));
  }, [t, resetKey, value, cycle]);
  function preview(patch: Partial<Hsva>) {
    if (!mounted.current || disabled) return false;
    const next = { ...current.current, ...patch, ...(!alpha ? { a: 1 } : {}) };
    if (onPreview(hsvaToHex(next)) === false) return false;
    current.current = next;
    if (pointer.current) {
      const thumb = pad.current?.querySelector<HTMLElement>(".react-colorful__saturation-pointer");
      const fill = thumb?.querySelector<HTMLElement>(".react-colorful__pointer-fill");
      if (thumb) {
        thumb.style.left = `${next.s}%`;
        thumb.style.top = `${100 - next.v}%`;
      }
      if (fill) fill.style.backgroundColor = hsvaToHex({ ...next, a: 1 });
      pad.current
        ?.querySelector('[role="slider"]')
        ?.setAttribute(
          "aria-valuetext",
          `${t("pickerSaturation")}: ${Math.round(next.s)}% / ${Math.round(next.v)}%`,
        );
      channels.current
        ?.querySelector<HTMLElement>(".color-alpha")
        ?.style.setProperty("--color-channel-fill", hsvaToHex({ ...next, a: 1 }));
    } else setDraft({ origin, color: next });
    return true;
  }
  const latest = useRef({ origin, disabled, preview, onCommit, onCancel });
  useLayoutEffect(() => {
    latest.current = { origin, disabled, preview, onCommit, onCancel };
  });
  useLayoutEffect(
    () => () => {
      pointer.current = null;
    },
    [origin],
  );
  useLayoutEffect(() => {
    mounted.current = true;
    function sample(event: PointerEvent) {
      const gesture = pointer.current,
        state = latest.current;
      if (
        !mounted.current ||
        !gesture ||
        gesture.id !== event.pointerId ||
        gesture.origin !== state.origin ||
        state.disabled
      )
        return false;
      const unit = (value: number) => Math.min(1, Math.max(0, value));
      return state.preview({
        h: current.current.h,
        s: unit((event.clientX - gesture.box.left) / gesture.box.width) * 100,
        v: (1 - unit((event.clientY - gesture.box.top) / gesture.box.height)) * 100,
      });
    }
    function move(event: PointerEvent) {
      sample(event);
    }
    function retire() {
      pointer.current = null;
      epoch.current++;
      setCycle(epoch.current);
    }
    function release(event: PointerEvent) {
      if (!pointer.current || pointer.current.id !== event.pointerId) return;
      const valid = sample(event);
      if (valid) setDraft({ origin: latest.current.origin, color: current.current });
      // Retire this genuine widget's pending effects before they can echo an old
      // color after the synchronous final sample has been committed.
      retire();
      if (valid) latest.current.onCommit();
    }
    function cancel(event: PointerEvent) {
      if (!pointer.current || pointer.current.id !== event.pointerId) return;
      retire();
      latest.current.onCancel?.();
    }
    samplePointer.current = sample;
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", cancel, true);
    return () => {
      mounted.current = false;
      pointer.current = null;
      samplePointer.current = () => false;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", cancel, true);
    };
  }, []);
  function channelKey(event: KeyboardEvent, channel: "h" | "a") {
    const direction =
      event.key === "ArrowRight" || event.key === (channel === "h" ? "ArrowDown" : "ArrowUp")
        ? 1
        : event.key === "ArrowLeft" || event.key === (channel === "h" ? "ArrowUp" : "ArrowDown")
          ? -1
          : 0;
    if (!direction || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    preview(
      channel === "h"
        ? { h: Math.max(0, Math.min(360, current.current.h + direction)) }
        : { a: Math.max(0, Math.min(1, current.current.a + direction * 0.01)) },
    );
  }
  return (
    <div
      ref={channels}
      className="color-channels"
      data-alpha={alpha}
      inert={disabled || undefined}
      aria-disabled={disabled || undefined}
    >
      <div
        ref={pad}
        className="color-sv-pad"
        // Pointer sampling below owns native mouse, pen and touch gestures.
        // Letting react-colorful also start its compatibility mouse/touch
        // gesture reads geometry after the pointer preview has written styles.
        // Keep its genuine focused slider and keyboard interaction intact.
        onMouseDownCapture={(event) => event.stopPropagation()}
        onTouchStartCapture={(event) => event.stopPropagation()}
        onPointerDownCapture={(event) => {
          if (disabled || event.button !== 0) return;
          const box = pad.current
            ?.querySelector<HTMLElement>(".react-colorful__saturation")
            ?.getBoundingClientRect();
          if (box && box.width > 0 && box.height > 0) {
            pointer.current = { id: event.pointerId, origin, box };
            pad.current
              ?.querySelector<HTMLElement>('.react-colorful__saturation [role="slider"]')
              ?.focus({ preventScroll: true });
            samplePointer.current(event.nativeEvent);
          }
        }}
      >
        <HsvColorPicker
          key={`${resetKey}:${value}:${cycle}`}
          color={{ h: color.h, s: color.s, v: color.v }}
          onChange={(next: HsvColor) => {
            if (
              mounted.current &&
              !pointer.current &&
              epoch.current === cycle &&
              latest.current.origin === origin &&
              !latest.current.disabled
            )
              latest.current.preview(next);
          }}
          onChangeEnd={() => {
            if (
              mounted.current &&
              !pointer.current &&
              epoch.current === cycle &&
              latest.current.origin === origin &&
              !latest.current.disabled
            )
              latest.current.onCommit();
          }}
        />
      </div>
      <Slider
        className="color-channel color-hue"
        disabled={disabled}
        aria-label={t("hue")}
        orientation="vertical"
        inverted
        min={0}
        max={360}
        step={0.1}
        value={[color.h]}
        onKeyDownCapture={(event) => channelKey(event, "h")}
        onValueChange={([h]) => preview({ h: h! })}
      />
      {alpha && (
        <Slider
          className="color-channel color-alpha"
          disabled={disabled}
          aria-label={t("alpha")}
          orientation="vertical"
          min={0}
          max={100}
          step={0.1}
          value={[color.a * 100]}
          style={
            {
              "--color-channel-fill": hsvaToHex({ ...color, a: 1 }),
            } as CSSProperties
          }
          onKeyDownCapture={(event) => channelKey(event, "a")}
          onValueChange={([a]) => preview({ a: a! / 100 })}
        />
      )}
    </div>
  );
}
