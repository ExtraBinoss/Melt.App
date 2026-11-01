import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { MediaPlayer } from "../../../shared/player/MediaPlayer";
import type { PreviewOwner } from "./runtime";
import type { PreviewPlayback } from "./playback";

export function PreviewPlayer({ owner }: { owner: PreviewOwner & { playback: PreviewPlayback } }) {
  const state = useSyncExternalStore(
    owner.playback.subscribe,
    owner.playback.read,
    owner.playback.read,
  );
  return (
    <MediaPlayer
      className="media-player-overlay"
      position={owner.playback.position}
      duration={state.duration}
      playing={state.playing}
      disabled={!state.ready}
      onPlayingChange={(playing) => owner.setPaused?.(!playing)}
      onSeek={(seconds) => owner.seek?.(seconds)}
    />
  );
}

/** A passive card indicator follows accepted frames, never an independent playback clock. */
export function PreviewProgress({ playback }: { playback: PreviewPlayback }) {
  const element = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    let last = 0;
    const paint = () => {
      const time = playback.position.read()[0] ?? 0;
      const { duration, playing } = playback.read();
      if (element.current) {
        element.current.dataset.interpolate = String(playing && time > last && time - last < 0.4);
        element.current.style.setProperty(
          "--preview-progress",
          `${duration ? (time / duration) * 100 : 0}%`,
        );
      }
      last = time;
    };
    paint();
    const stopPosition = playback.position.subscribe(paint);
    const stopState = playback.subscribe(paint);
    return () => {
      stopPosition();
      stopState();
    };
  }, [playback]);
  return (
    <span ref={element} className="motion-preview-progress" aria-hidden>
      <span />
    </span>
  );
}
