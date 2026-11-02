import { useMemo, useSyncExternalStore } from "react";
import type { CommandCommitInfo, EnginePort, SessionSnapshot } from "@musart/core";

interface SidebarSnapshot {
  snapshot: SessionSnapshot;
  historyNavigation: boolean;
}

function createSidebarSource(engine: EnginePort) {
  const observed = engine as EnginePort & {
    subscribeCommitInfo?: (listener: (info: CommandCommitInfo) => void) => () => void;
  };
  let value: SidebarSnapshot = { snapshot: engine.getSnapshot(), historyNavigation: false };
  const read = () => value;
  const subscribe = (notify: () => void) => {
    const publish = (snapshot: SessionSnapshot, historyNavigation: boolean) => {
      if (snapshot === value.snapshot && historyNavigation === value.historyNavigation) return;
      value = { snapshot, historyNavigation };
      notify();
    };
    const stopSnapshot = engine.subscribe(() => {
      const snapshot = engine.getSnapshot();
      // Commit metadata follows inside this same engine call. Selection needs no metadata.
      if (!observed.subscribeCommitInfo || snapshot.revision === value.snapshot.revision)
        publish(snapshot, false);
    });
    const stopCommits = observed.subscribeCommitInfo?.((info) => {
      const current = engine.getSnapshot();
      // Retain selection changes during publication without adopting a later document commit.
      const snapshot =
        current.revision === info.snapshot.revision && current.project === info.snapshot.project
          ? current
          : info.snapshot;
      publish(snapshot, info.kind === "undo" || info.kind === "redo");
    });
    publish(engine.getSnapshot(), false);
    return () => {
      stopSnapshot();
      stopCommits?.();
    };
  };
  return { read, subscribe };
}

/** Pair document publication with its synchronous commit metadata before rendering controls. */
export function useSidebarSnapshot(engine: EnginePort): SidebarSnapshot {
  const source = useMemo(() => createSidebarSource(engine), [engine]);
  return useSyncExternalStore(source.subscribe, source.read, source.read);
}
