import type { Asset, Effect } from "@musart/core";
import type { MediaSourceResolver } from "@musart/render";
import type { ToolDefinition } from "../catalog";
export type ToolRenderApi = Pick<
  typeof import("@musart/render"),
  "createRenderSession" | "probeVideoOriginal" | "exportMotionVideo"
>;
export interface ToolSource {
  file: File;
  asset: Asset;
  duration: number;
  hasAudio: boolean;
  resolver?: MediaSourceResolver;
}
export interface ToolState {
  phase: "preparing" | "ready" | "exporting" | "error";
  effect: Effect | null;
  name: string;
  width: number;
  height: number;
  edge: number;
  sourceDuration: number;
  clipStart: number;
  clipLength: number;
  hasAudio: boolean;
  keepAudio: boolean;
  playing: boolean;
  time: number;
  comparing: boolean;
  progress: number;
  error: unknown;
}
export interface WorkspaceProps {
  file: File;
  tool: ToolDefinition;
  host: HTMLDivElement;
  onActivity: (file: File, active: boolean, phase?: "prepare" | "export") => void;
}
export type ImageOutput = "png" | "jpeg" | "webp";
export type VideoOutput = "auto" | "mp4" | "webm";
