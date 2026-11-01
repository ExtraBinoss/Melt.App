import type { CommandCommitInfo, EnginePort, HistoryDescription } from "@musart/core";

export interface HistoryNoticeValue {
  description?: HistoryDescription;
  direction: "undo" | "redo";
  id: number;
}
interface SummaryEngine extends EnginePort {
  subscribeCommitInfo(listener: (event: CommandCommitInfo) => void): () => void;
}

/** Undo entries own their descriptions, including entries made before this observer mounted. */
export function observeHistoryNotices(
  engine: EnginePort,
  publish: (notice: HistoryNoticeValue | null) => void,
): () => void {
  if (!("subscribeCommitInfo" in engine) || typeof engine.subscribeCommitInfo !== "function")
    return () => {};
  let sequence = 0;
  return (engine as SummaryEngine).subscribeCommitInfo((event) => {
    if (event.kind === "load") publish(null);
    else if (event.kind === "undo" || event.kind === "redo")
      publish({ description: event.history, direction: event.kind, id: ++sequence });
  });
}
