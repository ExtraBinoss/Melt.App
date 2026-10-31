import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { useOverlayEntrance } from "../overlays/use-overlay-entrance";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "../../ui/tooltip";
import { Slider } from "../../ui/slider";
import type { SliderValueSource } from "../../ui/slider-value";
export interface PlayerAudio {
  /** Local playback volume, 0–100. This never edits authored/exported audio. */
  value: SliderValueSource;
  setVolume: (percent: number) => void;
}
export function PlayerVolume({
  audio,
  disabled,
  audioContext = "preview",
}: {
  audio?: PlayerAudio;
  disabled?: boolean;
  audioContext?: "preview" | "artboard";
}) {
  const { t } = useTranslation("mediaPlayer");
  const prepare = useOverlayEntrance();
  const lastAudibleRef = useRef(100);
  const outputRef = useRef<HTMLOutputElement>(null);
  const muted = useSyncExternalStore(
    audio?.value.subscribe ?? noSubscribe,
    () => !audio || (audio.value.read()[0] ?? 0) === 0,
    () => true,
  );
  useLayoutEffect(() => {
    const update = () => {
      const value = audio?.value.read()[0] ?? 0;
      if (value > 0) lastAudibleRef.current = value;
      if (outputRef.current) outputRef.current.textContent = `${Math.round(value)}%`;
    };
    update();
    return audio?.value.subscribe(update);
  }, [audio]);
  if (!audio)
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="media-player-no-audio"
              tabIndex={disabled ? undefined : 0}
              aria-label={t(audioContext === "artboard" ? "noArtboardAudio" : "silent")}
            >
              <Button variant="ghost" size="icon-sm" disabled aria-label={t("volume")}>
                <VolumeX size={15} />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {t(audioContext === "artboard" ? "noArtboardAudio" : "silent")}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="media-player-volume-trigger"
          onPointerDownCapture={(event) => {
            if (event.button === 0) prepare(true);
          }}
          onKeyDownCapture={(event) => {
            if (event.key === "Enter" || event.key === " ") prepare(true);
          }}
          onBlur={() => prepare(false)}
          disabled={disabled}
          aria-label={t("volume")}
        >
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="media-player-volume"
        aria-label={t("volume")}
        data-canvas-control
        data-keybinding-capture
      >
        <div className="media-player-volume-row">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={t(muted ? "unmute" : "mute")}
            onClick={() => audio?.setVolume(muted ? lastAudibleRef.current : 0)}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </Button>
          <Slider
            min={0}
            max={100}
            step={1}
            tone="primary"
            valueSource={audio.value}
            disabled={disabled}
            aria-label={t("volume")}
            onValueChange={([value]) => audio?.setVolume(value ?? 0)}
          />
          <output
            ref={(node) => {
              outputRef.current = node;
              if (node) node.textContent = `${Math.round(audio?.value.read()[0] ?? 0)}%`;
            }}
          >
            0%
          </output>
        </div>
      </PopoverContent>
    </Popover>
  );
}
const noSubscribe = () => () => {};
