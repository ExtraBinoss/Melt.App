import { useMemo, useState, useSyncExternalStore } from "react";
import type { CommandCommitInfo, EnginePort } from "@musart/core";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import { rulerChange } from "../../../services/motion/ruler-change";

export interface PaintInvalidation {
  subscribe(this: void, listener: () => void): () => void;
}

type SummaryEngine = EnginePort & {
  subscribeCommitInfo?: (listener: (event: CommandCommitInfo) => void) => () => void;
};

/** Payload-free ownership changes update React; ordinary document edits only invalidate drafts. */
function createPaintScope(engine?: EnginePort, external?: PaintInvalidation) {
  let epoch = 0;
  const read = () => {
    const snapshot = engine?.getSnapshot();
    return JSON.stringify([snapshot?.project.id, snapshot?.pageId, epoch]);
  };
  return {
    read,
    subscribe(this: void, listener: () => void) {
      if (!engine) return () => {};
      const commits = engine as SummaryEngine;
      const stopOwner = engine.subscribe(listener);
      const stopLoad = commits.subscribeCommitInfo?.((event) => {
        if (event.kind === "load") {
          epoch++;
          listener();
        }
      });
      return () => {
        stopOwner();
        stopLoad?.();
      };
    },
    invalidation: {
      subscribe(this: void, listener: () => void) {
        const commits = engine as SummaryEngine | undefined;
        let previous = engine?.getSnapshot();
        const stopDocument = engine
          ? engine.subscribe(() => {
              const next = engine.getSnapshot();
              const compatibleRulers = Boolean(
                commits?.subscribeCommitInfo &&
                previous &&
                previous.selection === next.selection &&
                rulerChange(previous, next),
              );
              const changed =
                !compatibleRulers &&
                (previous?.project !== next.project ||
                  previous?.pageId !== next.pageId ||
                  previous?.selection !== next.selection);
              previous = next;
              if (changed) listener();
            })
          : undefined;
        const stopHistory = commits?.subscribeCommitInfo?.((event) => {
          if (event.kind === "undo" || event.kind === "redo" || event.kind === "load") listener();
        });
        const stopClock = engine ? motionTimeChanges(engine).subscribe(listener) : undefined;
        const stopExternal = external?.subscribe(listener);
        return () => {
          stopDocument?.();
          stopHistory?.();
          stopClock?.();
          stopExternal?.();
        };
      },
    },
  };
}

export function usePaintScope(engine?: EnginePort, external?: PaintInvalidation) {
  const [instance, setInstance] = useState({ engine, epoch: 0 });
  if (instance.engine !== engine) setInstance({ engine, epoch: instance.epoch + 1 });
  const scope = useMemo(() => createPaintScope(engine, external), [engine, external]);
  const owner = useSyncExternalStore(scope.subscribe, scope.read, scope.read);
  return useMemo(
    () => ({
      identity: JSON.stringify([instance.epoch, owner]),
      invalidation: scope.invalidation,
    }),
    [instance.epoch, owner, scope],
  );
}
