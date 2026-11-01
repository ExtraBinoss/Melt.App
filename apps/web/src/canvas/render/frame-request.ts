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
  fontTicket?: FontRenderTicket;
}
