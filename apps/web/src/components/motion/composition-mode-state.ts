import type { SessionSnapshot } from "@musart/core";

/** Mode controls retain only their owner and visible state, never documents or original media. */
export interface CompositionModeState {
  readonly projectId: string;
  readonly pageId: string;
  readonly mode: "static" | "motion";
  readonly initialized: boolean;
}

export function compositionModeState(snapshot: SessionSnapshot): CompositionModeState {
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  return {
    projectId: snapshot.project.id,
    pageId: snapshot.pageId,
    mode: page.motion?.mode ?? "static",
    initialized: Boolean(page.motion),
  };
}
