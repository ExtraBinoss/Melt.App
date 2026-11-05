import type { CommandCommitInfo, EnginePort, HistoryDescription } from "@musart/core";
import { historyOwnerNames, type HistoryOwnerNames } from "./owners";

export interface HistoryNoticeValue {
  description?: HistoryDescription;
  direction: "undo" | "redo";
  id: number;
  owners?: HistoryOwnerNames;
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
  let previous = engine.getSnapshot(),
    retained = new WeakMap<HistoryDescription, HistoryOwnerNames>();
  return (engine as SummaryEngine).subscribeCommitInfo((event) => {
    const before = previous;
    previous = event.snapshot;
    if (event.kind === "load") {
      retained = new WeakMap();
      publish(null);
      return;
    }
    let owners: HistoryOwnerNames | undefined;
    if (event.history) {
      owners = retained.get(event.history);
      if (!owners) {
        owners = historyOwnerNames(event.history, before, event.snapshot);
        retained.set(event.history, owners);
      }
    }
    if (event.kind === "undo" || event.kind === "redo")
      publish({
        description: event.history,
        direction: event.kind,
        id: ++sequence,
        ...(owners ? { owners } : {}),
      });
  });
}
