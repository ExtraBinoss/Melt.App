import type { Project, SessionSnapshot } from "@musart/core";

interface PageMode {
  readonly id: string;
  readonly mode: "static" | "motion";
  readonly initialized: boolean;
}
export interface ArtboardModes {
  readonly projectId: string;
  readonly pageId: string;
  readonly pages: readonly PageMode[];
}

/** A bounded primitive projection: artwork/history cannot invalidate unchanged mode controls. */
export function createArtboardModeProjection() {
  let observed: WeakRef<Project> | undefined;
  let cached: ArtboardModes | undefined;
  return (snapshot: SessionSnapshot): ArtboardModes => {
    if (observed?.deref() === snapshot.project && cached?.pageId === snapshot.pageId) return cached;
    observed = new WeakRef(snapshot.project);
    const pages = snapshot.project.pages.map((page): PageMode => ({
      id: page.id,
      mode: page.motion?.mode ?? "static",
      initialized: Boolean(page.motion),
    }));
    if (
      cached?.projectId === snapshot.project.id &&
      cached.pageId === snapshot.pageId &&
      cached.pages.length === pages.length &&
      cached.pages.every((page, index) => {
        const next = pages[index]!;
        return (
          page.id === next.id && page.mode === next.mode && page.initialized === next.initialized
        );
      })
    )
      return cached;
    cached = { projectId: snapshot.project.id, pageId: snapshot.pageId, pages };
    return cached;
  };
}
