import { useEffect, useState } from "react";

/** Read one listing record, never originals, thumbnails or the replay journal. */
export async function readOpeningProjectName(projectId: string, signal: AbortSignal) {
  const { ProjectStore } = await import("../services/projects/storage");
  signal.throwIfAborted();
  const store = new ProjectStore();
  try {
    const page = await store.listPage({ ids: [projectId], limit: 1 });
    signal.throwIfAborted();
    const name = page.projects.find((project) => project.id === projectId)?.name;
    return name?.trim() ? name : undefined;
  } finally {
    await store.close();
  }
}

/** Names belong to a durable route target; late reads cannot label another project. */
export function useOpeningProjectName(
  projectId?: string,
  loadedProject?: { id: string; name: string },
) {
  const knownName =
    loadedProject && (!projectId || loadedProject.id === projectId)
      ? loadedProject.name
      : undefined;
  const [resolved, setResolved] = useState<{ id: string; name?: string }>();
  useEffect(() => {
    if (!projectId || knownName) return;
    const controller = new AbortController();
    void readOpeningProjectName(projectId, controller.signal).then(
      (name) => {
        if (!controller.signal.aborted) setResolved({ id: projectId, name });
      },
      () => {
        // The runtime reports real opening errors; optional label metadata must not block it.
      },
    );
    return () => controller.abort();
  }, [projectId, knownName]);
  return knownName ?? (resolved?.id === projectId ? resolved?.name : undefined);
}
