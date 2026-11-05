import type { Asset, Bounds, Composition, MotionFramePlan } from "@musart/core";
import type { MediaSourceResolver, RenderOptions } from "@musart/render";
import type {
  CanonicalOrigin,
  PresentationTicket,
} from "../../state/session/canonical-presentation";
import type { FontRenderTicket } from "../../state/session/font-presentation";
declare const canonicalLineage: unique symbol;
/** Issued only after a synchronous engine commit summary certifies a contiguous scope. */
export type CanonicalContinuation = { readonly [canonicalLineage]: true };

export interface PresentationInput {
  origin: CanonicalOrigin;
  canonical: boolean;
  /** Opaque certification of one contiguous paint/transform gesture, retired by its source. */
  preview?: object;
  continuation?: CanonicalContinuation;
  /** Prior canonical frame allowed through a scalar preview; clear waits only one microtask for its commit. */
  baseContinuation?: CanonicalContinuation;
}
export interface PreviewRequest {
  immutableFrame?: RenderOptions["immutableFrame"];
  page: Composition;
  assets: Record<string, Asset>;
  revision: number;
  scale: number;
  viewport?: Bounds;
  ticket?: PresentationTicket;
  motionFrame?: MotionFramePlan;
  origin?: CanonicalOrigin;
  mediaResolver?: MediaSourceResolver;
  playback: boolean;
  preview?: object;
  continuation?: CanonicalContinuation;
  fontTicket?: FontRenderTicket;
}
