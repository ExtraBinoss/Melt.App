import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "../../ui/input";
import type { SliderValueSource } from "../../ui/slider-value";
import { parsePlayerTime, playerTime } from "./clock";

/** Editable play position; frame updates never overwrite an active draft. */
export function PlayerTimeField({
  position,
  duration,
  playing,
  disabled,
  identity,
  onSeek,
  onPlayingChange,
}: {
  position: SliderValueSource;
  duration: number;
  playing: boolean;
  disabled?: boolean;
  identity: unknown;
  onSeek: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
}) {
  const { t } = useTranslation("mediaPlayer");
  const input = useRef<HTMLInputElement>(null);
  const draft = useRef<{ owner: unknown; original: number; dirty: boolean } | null>(null);
  const owner = useRef<unknown>(null);
  useLayoutEffect(() => {
    owner.current = disabled ? null : identity;
    draft.current = null;
    input.current?.removeAttribute("data-player-time-editing");
    return () => {
      owner.current = null;
      draft.current = null;
    };
  }, [identity, disabled]);
  useLayoutEffect(() => {
    const paint = () => {
      if (input.current && !draft.current)
        input.current.value = playerTime(position.read()[0] ?? 0);
    };
    paint();
    return position.subscribe(paint);
  }, [position, identity, disabled]);
  function finish(cancel = false) {
    const edit = draft.current;
    draft.current = null;
    input.current?.removeAttribute("data-player-time-editing");
    if (!edit || owner.current !== edit.owner || disabled) return;
    const time = parsePlayerTime(input.current?.value ?? "");
    if (!cancel && edit.dirty && time !== null) {
      if (playing) onPlayingChange(false);
      onSeek(Math.max(0, Math.min(duration, time)));
      if (playing) onPlayingChange(true);
    }
    if (input.current)
      input.current.value = playerTime(
        cancel || !edit.dirty || time === null
          ? (position.read()[0] ?? edit.original)
          : Math.max(0, Math.min(duration, time)),
      );
  }
  return (
    <Input
      ref={input}
      className="media-player-time-input"
      type="text"
      inputMode="decimal"
      aria-label={t("startTime")}
      disabled={disabled}
      defaultValue={playerTime(position.read()[0] ?? 0)}
      onFocus={(event) => {
        if (owner.current !== identity || disabled) return;
        draft.current = { owner: identity, original: position.read()[0] ?? 0, dirty: false };
        event.currentTarget.setAttribute("data-player-time-editing", "");
      }}
      onChange={() => {
        if (draft.current) draft.current.dirty = true;
      }}
      onBlur={() => finish()}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        finish(event.key === "Escape");
        event.currentTarget.blur();
      }}
    />
  );
}

/** Let the field cancel its draft before Radix dismisses the surrounding dialog. */
export function preservePlayerTimeEdit(event: KeyboardEvent) {
  if (event.target instanceof Element && event.target.closest("[data-player-time-editing]"))
    event.preventDefault();
}
