import type { Project, MotionTime } from "@musart/core";
import type { MediaSourceResolver } from "@musart/render";
import { MotionAudioPlayback } from "./playback";
export interface PreviewAudioPort {
  source(): { project: Project; pageId: string };
  read(): { playing: boolean; time: MotionTime };
  subscribe(listener: () => void): () => void;
  holdPlayback(): (delayMs?: number) => void;
  pause(): void;
  resolver(): MediaSourceResolver;
  onError(error: unknown): void;
}
/** Isolated, initially muted monitor. Reuses the engine's bounded worker mixer and native clock. */
export class PreviewAudio {
  private readonly listeners = new Set<() => void>();
  private readonly volumeListeners = new Set<() => void>();
  private current: readonly number[] = [0];
  private closed = false;
  private disposal: Promise<void> | null = null;
  private refreshing = false;
  private readonly playback: MotionAudioPlayback;
  private readonly stop: () => void;
  readonly value = {
    read: () => this.current,
    subscribe: (fn: () => void) => {
      this.volumeListeners.add(fn);
      return () => {
        this.volumeListeners.delete(fn);
      };
    },
  };
  constructor(port: PreviewAudioPort) {
    this.playback = new MotionAudioPlayback(
      { getSnapshot: () => port.source() },
      {
        read: () => ({
          ...port.read(),
          playing:
            !this.closed &&
            !this.refreshing &&
            !document.hidden &&
            this.current[0]! > 0 &&
            port.read().playing,
          compositionId: port.source().pageId,
          playbackMode: "loop",
        }),
        subscribe: (fn) => {
          this.listeners.add(fn);
          return () => {
            this.listeners.delete(fn);
          };
        },
        readAudioMixPublication: () => null,
        holdPlayback: () => port.holdPlayback(),
        pause: () => port.pause(),
      },
      () => port.resolver(),
      (error) => {
        if (!this.closed) port.onError(error);
      },
    );
    this.stop = port.subscribe(this.publish);
    document.addEventListener("visibilitychange", this.publish);
  }
  private readonly publish = () => {
    for (const listener of this.listeners) listener();
  };
  setVolume = (percent: number) => {
    if (this.closed) return;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100)
      throw new RangeError("Invalid preview volume.");
    this.current = [percent];
    this.playback.setMasterVolume(percent / 100);
    this.volumeListeners.forEach((listener) => listener());
    this.publish();
  };
  refresh() {
    this.refreshing = true;
    this.publish();
    this.refreshing = false;
    this.publish();
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.stop();
    document.removeEventListener("visibilitychange", this.publish);
    this.listeners.clear();
    this.volumeListeners.clear();
    return (this.disposal = this.playback.dispose());
  }
}
