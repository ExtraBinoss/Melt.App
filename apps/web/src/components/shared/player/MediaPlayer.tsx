import { useLayoutEffect, useRef } from "react";
import { Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { Slider } from "../../ui/slider";
import type { SliderValueSource } from "../../ui/slider-value";
import { PlayerTimeField } from "./PlayerTimeField";
import { PlayerVolume, type PlayerAudio } from "./PlayerVolume";
import { playerTime } from "./clock";
import "./messages";
import "./player.css";
export function MediaPlayer({
  position,
  duration,
  playing,
  disabled,
  onPlayingChange,
  onSeek,
  audio,
  audioContext = "preview",
  className = "",
  identity = position,
}: {
  position: SliderValueSource;
  duration: number;
  playing: boolean;
  disabled?: boolean;
  onPlayingChange: (playing: boolean) => void;
  onSeek: (seconds: number) => void;
  audio?: PlayerAudio;
  audioContext?: "preview" | "artboard";
  className?: string;
  identity?: unknown;
}) {
  const { t } = useTranslation("mediaPlayer");
  const outputRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef<number | null>(null);
  const ownerRef = useRef<unknown>(null);
  const gestureRef = useRef<{ original: number; playing: boolean; keyboard: boolean } | null>(null);
  const usable = Number.isFinite(duration) && duration > 0;
  useLayoutEffect(() => {
    ownerRef.current = disabled ? null : identity;
    return () => {
      ownerRef.current = null;
      gestureRef.current = null;
    };
  }, [identity, disabled]);
  useLayoutEffect(() => {
    const paint = () => {
      const time = Math.max(0, Math.min(usable ? duration : 0, position.read()[0] ?? 0));
      if (rootRef.current) {
        const last = lastTimeRef.current;
        rootRef.current.dataset.interpolate = String(
          playing &&
            time > 0 &&
            time < duration &&
            !gestureRef.current &&
            last !== null &&
            time >= last &&
            time - last < 0.4,
        );
        rootRef.current.style.setProperty(
          "--player-position",
          `${usable ? (time / duration) * 100 : 0}%`,
        );
        lastTimeRef.current = time;
      }
      if (outputRef.current) {
        outputRef.current.dataset.time = String(time);
      }
    };
    paint();
    return position.subscribe(paint);
  }, [position, duration, usable, playing]);
  function begin(keyboard: boolean) {
    if (ownerRef.current !== identity || disabled || !usable || gestureRef.current) return;
    if (rootRef.current) rootRef.current.dataset.interpolate = "false";
    gestureRef.current = { original: position.read()[0] ?? 0, playing, keyboard };
    onPlayingChange(false);
  }
  function finish(cancel = false) {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture || ownerRef.current !== identity) return;
    if (cancel) onSeek(gesture.original);
    if (gesture.playing) onPlayingChange(true);
  }
  return (
    <div
      ref={rootRef}
      className={`media-player ${className}`}
      data-player=""
      data-canvas-control
      data-keybinding-capture
    >
      <div className="media-player-main" role="group" aria-label={t("time")}>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled || !usable}
          aria-label={t(playing ? "pause" : "play")}
          onClick={() => {
            if (ownerRef.current === identity) onPlayingChange(!playing);
          }}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </Button>
        <PlayerTimeField
          position={position}
          duration={duration}
          playing={playing}
          disabled={disabled || !usable}
          identity={identity}
          onSeek={onSeek}
          onPlayingChange={onPlayingChange}
        />
        <span className="media-player-duration" ref={outputRef} data-player-time="">
          {" "}
          / {playerTime(duration)}
        </span>
        <span className="media-player-spacer" />
        <PlayerVolume audio={audio} disabled={disabled} audioContext={audioContext} />
      </div>
      <Slider
        className="media-player-seek"
        tone="primary"
        min={0}
        max={usable ? duration : 1}
        step={0.001}
        valueSource={position}
        disabled={disabled || !usable}
        aria-label={t("seek")}
        onPointerDownCapture={(event) => {
          if (event.button === 0) begin(false);
        }}
        onPointerCancel={() => finish(true)}
        onKeyDownCapture={(event) => {
          if (event.key === "Escape" && gestureRef.current) {
            event.preventDefault();
            event.stopPropagation();
            finish(true);
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
          )
            begin(true);
        }}
        onKeyUp={() => {
          if (gestureRef.current?.keyboard) finish();
        }}
        onBlur={() => finish()}
        onValueChange={([value]) => {
          if (value !== undefined && gestureRef.current && ownerRef.current === identity)
            onSeek(value);
        }}
        onValueCommit={() => {
          if (!gestureRef.current?.keyboard) finish();
        }}
      />
    </div>
  );
}
