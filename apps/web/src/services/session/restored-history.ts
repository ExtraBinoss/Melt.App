import type { EnginePort, Project, RestoredHistory } from "@musart/core";
import type { HistoryStore } from "../history/store";
import { DeletedProjectError } from "../projects/lifecycle";
import { StaleProjectWriteError } from "../projects/writes/revision";

function report(project: Project, error: unknown) {
  console.error("[Melt history restoration failed]", { projectId: project.id }, error);
}

/** Broken optional history must not make the validated saved document inaccessible. */
export async function readRestoredHistory(
  store: HistoryStore,
  project: Project,
  signal?: AbortSignal,
) {
  try {
    return await store.restore(project, signal);
  } catch (error) {
    if (
      signal?.aborted ||
      error instanceof DeletedProjectError ||
      error instanceof StaleProjectWriteError
    )
      throw error;
    report(project, error);
    return undefined;
  }
}

export function loadRestoredProject(
  engine: EnginePort,
  project: Project,
  history: RestoredHistory | undefined,
) {
  const before = engine.getSnapshot();
  try {
    engine.load(project, history);
  } catch (error) {
    if (!history || engine.getSnapshot() !== before) throw error;
    report(project, error);
    // Engine validation precedes publication, so the fallback is still one atomic load.
    engine.load(project);
  }
}
