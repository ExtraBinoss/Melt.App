import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { Slider } from "../../ui/slider";
import type { SliderValueSource } from "../../ui/slider-value";
export interface PlayerAudio {
  /** Local playback volume, 0–100. This never edits authored/exported audio. */
  value: SliderValueSource;
  setVolume: (percent: number) => void;
}
export function PlayerVolume({ audio, disabled }: { audio?: PlayerAudio; disabled?: boolean }) {
  const { t } = useTranslation("mediaPlayer");
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
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="media-player-volume-trigger"
          disabled={disabled}
          aria-label={t("volume")}
          aria-description={!audio ? t("silent") : undefined}
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
            disabled={!audio || disabled}
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
            valueSource={audio?.value}
            value={audio ? undefined : [0]}
            disabled={!audio || disabled}
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
        {!audio && <small>{t("silent")}</small>}
      </PopoverContent>
    </Popover>
  );
}
const noSubscribe = () => () => {};
