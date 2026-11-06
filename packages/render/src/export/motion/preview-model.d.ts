import type { MotionTime } from "@musart/core";
import type { MotionVideoExportOptions } from "./model";

export interface MotionPreviewState {
  playing: boolean;
  time: MotionTime;
  duration: MotionTime;
  busy: boolean;
  error: unknown;
}
export interface MotionPreviewOptions extends Pick<
  MotionVideoExportOptions,
  | "staticDuration"
  | "framing"
  | "centerSelection"
  | "selection"
  | "compositionId"
  | "mediaResolver"
  | "fontResolver"
  | "forceWebGL"
  | "maxGpuBytes"
> {
  /** Physical raster edge, independent of delivered export resolution; maximum 768. */
  edge?: number;
  onFrame: (canvas: HTMLCanvasElement, backend?: "webgpu" | "webgl" | null) => void;
  /** Caller-owned UI admission. Waiting parks GPU work without changing the audio/playback clock. */
  presentation?: { busy(): boolean; subscribe(listener: () => void): () => void };
  scheduler?: {
    now(): number;
    request(callback: () => void): number;
    cancel(handle: number): void;
  };
}
