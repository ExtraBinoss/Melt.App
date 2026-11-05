import { useCallback, useLayoutEffect, useRef } from "react";
import { useStore } from "jotai";
import type { CaptureGuides, Composition, EnginePort, SessionSnapshot } from "@musart/core";
import { previewAtom } from "../../../state/session/editor";
import type { PreviewValue } from "../../../state/session/preview-source";

/** A presentation draft with the existing engine as its only commit/undo authority. */
export function useGuideEdit(engine: EnginePort, page: Composition) {
  const store = useStore();
  const held = useRef<SessionSnapshot | null>(null);
  const owned = useRef<PreviewValue | null>(null);
  const cancel = useCallback(() => {
    if (owned.current && store.get(previewAtom) === owned.current) store.set(previewAtom, null);
    owned.current = null;
    held.current = null;
  }, [store]);
  useLayoutEffect(() => {
    const stop = engine.subscribe(cancel);
    return () => {
      stop();
      cancel();
    };
  }, [engine, cancel]);
  function current() {
    const snapshot = engine.getSnapshot();
    return snapshot.project.pages.find((item) => item.id === snapshot.pageId) === page &&
      (!held.current || held.current === snapshot)
      ? snapshot
      : null;
  }
  return {
    cancel,
    preview(value: CaptureGuides) {
      const snapshot = current();
      if (!snapshot) {
        cancel();
        return;
      }
      held.current ??= snapshot;
      owned.current = { target: "page", patch: { captureGuides: value } };
      store.set(previewAtom, owned.current);
    },
    commit(value: CaptureGuides) {
      const valid = current();
      cancel();
      if (valid && JSON.stringify(page.captureGuides) !== JSON.stringify(value))
        engine.execute({ type: "updatePage", patch: { captureGuides: value } });
    },
  };
}
