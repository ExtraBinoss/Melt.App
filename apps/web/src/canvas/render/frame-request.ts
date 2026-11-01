import type { Asset, Composition, MotionFramePlan } from "@musart/core";
import type { MediaSourceResolver, RenderOptions } from "@musart/render";
import type {
  CanonicalOrigin,
  PresentationTicket,
} from "../../state/session/canonical-presentation";
import type { FontRenderTicket } from "../../state/session/font-presentation";

export interface PresentationInput {
  origin: CanonicalOrigin;
  canonical: boolean;
  /** Opaque certification of a contiguous paint preview, retired by its source. */
  preview?: object;
}
export interface PreviewRequest {
  immutableFrame?: RenderOptions["immutableFrame"];
  page: Composition;
  assets: Record<string, Asset>;
  revision: number;
  scale: number;
  ticket?: PresentationTicket;
  motionFrame?: MotionFramePlan;
  origin?: CanonicalOrigin;
  mediaResolver?: MediaSourceResolver;
  playback: boolean;
  preview?: object;
  fontTicket?: FontRenderTicket;
}
