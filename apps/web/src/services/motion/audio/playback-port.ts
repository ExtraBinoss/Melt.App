import type { Project, MotionTime } from "@musart/core";
import type { AudioMixPublication } from "./commit-policy";
import type { MotionPlaybackMode } from "../transport";
/** Minimal clock/document ports shared by editor playback and isolated preview players. */
export interface AudioPlaybackSource {
  getSnapshot(): { project: Project; pageId: string };
}
export interface AudioPlaybackClock {
  read(): {
    compositionId: string;
    time: MotionTime;
    playing: boolean;
    playbackMode: MotionPlaybackMode;
  };
  subscribe(listener: () => void): () => void;
  readAudioMixPublication(): AudioMixPublication | null;
  holdPlayback(): (delayMs?: number) => void;
  pause(): void;
}
