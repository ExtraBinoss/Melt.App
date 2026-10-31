import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { MediaPlayer } from "../../components/shared/player/MediaPlayer";
import { createSliderValue } from "../../components/ui/slider-value";
import type { ToolController } from "./controller";
export function ToolTransport({
  controller,
  disabled,
}: {
  controller: ToolController;
  disabled: boolean;
}) {
  const [position] = useState(() => createSliderValue([0]));
  const playing = useSyncExternalStore(
    controller.transport.subscribe,
    () => controller.transport.read().playing,
  );
  const duration = useSyncExternalStore(
    controller.transport.subscribe,
    () => controller.transport.read().duration,
  );
  useLayoutEffect(() => {
    const paint = () => position.set([controller.transport.read().time]);
    paint();
    return controller.transport.subscribe(paint);
  }, [controller, position]);
  return (
    <MediaPlayer
      className="tool-transport"
      position={position}
      duration={duration}
      playing={playing}
      disabled={disabled}
      onPlayingChange={controller.play}
      onSeek={controller.seek}
      audio={controller.previewAudio}
    />
  );
}
