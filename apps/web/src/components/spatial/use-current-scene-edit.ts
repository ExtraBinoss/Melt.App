import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import type { CommandCommitInfo, Composition, EnginePort, SpatialScene } from "@musart/core";
import { useScenePreview } from "./use-scene-preview";

type Edit = ReturnType<typeof useScenePreview>;
type SummaryEngine = EnginePort & {
  subscribeCommitInfo?: (listener: (info: CommandCommitInfo) => void) => () => void;
};

function ownerSource(engine: EnginePort) {
  let epoch = 0;
  const read = () => {
    const snapshot = engine.getSnapshot();
    return JSON.stringify([snapshot.project.id, snapshot.pageId, snapshot.selection, epoch]);
  };
  return {
    read,
    subscribe(this: void, listener: () => void) {
      const stop = engine.subscribe(listener);
      const stopLoad = (engine as SummaryEngine).subscribeCommitInfo?.((info) => {
        if (info.kind === "load") {
          epoch++;
          listener();
        }
      });
      return () => {
        stop();
        stopLoad?.();
      };
    },
  };
}

/** Stable callbacks delegate only to the exact current canonical page binding. */
function sceneBinding(engine: EnginePort, owner: string, settings: SpatialScene) {
  const listeners = new Set<() => void>();
  let generation = 0;
  let current: { page: Composition; edit: Edit; selection: readonly string[] } | null = null;
  let drafting = false;
  const read = () => {
    const snapshot = engine.getSnapshot();
    return current &&
      (current.page.spatial ?? settings) === settings &&
      snapshot.pageId === current.page.id &&
      snapshot.project.pages.find((page) => page.id === snapshot.pageId) === current.page &&
      snapshot.selection === current.selection
      ? current
      : null;
  };
  const cancel = () => {
    drafting = false;
    current?.edit.cancel();
  };
  return {
    owner,
    read: () => generation,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    bind(page: Composition, edit: Edit) {
      const interrupted = Boolean(current && current.edit !== edit && drafting);
      if (current?.edit !== edit) cancel();
      current = { page, edit, selection: engine.getSnapshot().selection };
      if (interrupted) {
        generation++;
        for (const listener of listeners) listener();
      }
    },
    dispose() {
      cancel();
      current = null;
    },
    edit: {
      begin(this: void) {
        const bound = read();
        if (!bound) return;
        drafting = Boolean(bound.edit.begin());
      },
      preview: (...args: Parameters<Edit["preview"]>) => {
        const bound = read();
        if (!bound) return cancel();
        drafting = true;
        bound.edit.preview(...args);
      },
      commit: (...args: Parameters<Edit["commit"]>) => {
        const bound = read();
        if (!bound) return cancel();
        drafting = false;
        bound.edit.commit(...args);
      },
      cancel,
    },
  };
}

/** Idle controls survive unrelated edits; interrupted drafts still reset synchronously. */
export function useCurrentSceneEdit(
  engine: EnginePort,
  page: Composition,
  run: (task: () => void) => void,
  settings: SpatialScene,
) {
  const edit = useScenePreview(engine, page, run, settings);
  const source = useMemo(() => ownerSource(engine), [engine]);
  const owner = useSyncExternalStore(source.subscribe, source.read, source.read);
  const binding = useMemo(() => sceneBinding(engine, owner, settings), [engine, owner, settings]);
  const generation = useSyncExternalStore(binding.subscribe, binding.read, binding.read);
  useLayoutEffect(() => {
    binding.bind(page, edit);
  }, [binding, page, edit]);
  useLayoutEffect(() => () => binding.dispose(), [binding]);
  const identity = useMemo(() => ({ binding, generation }), [binding, generation]);
  return { owner, identity, edit: binding.edit };
}
