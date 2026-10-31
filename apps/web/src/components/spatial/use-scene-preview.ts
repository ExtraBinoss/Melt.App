import { useEffect, useMemo } from "react";
import { useStore } from "jotai";
import type { Composition, EnginePort, SessionSnapshot, SpatialScene } from "@musart/core";
import type { PreviewValue } from "../../state/session/preview-source";
import { previewAtom } from "../../state/session/editor";
import { createMotionTransport } from "../../services/motion/transport";
function createScenePreview(
  engine: EnginePort,
  page: Composition,
  store: ReturnType<typeof useStore>,
  run: (task: () => void) => void,
) {
  let held: { origin: SessionSnapshot; preview: PreviewValue | null } | null = null;
  const cancel = () => {
    if (held?.preview && store.get(previewAtom) === held.preview) store.set(previewAtom, null);
    held = null;
  };
  const current = (origin: SessionSnapshot) => {
    const value = engine.getSnapshot();
    return (
      value.project === origin.project &&
      value.pageId === origin.pageId &&
      value.revision === origin.revision
    );
  };
  const begin = () => {
    if (held) return held;
    const origin = engine.getSnapshot();
    if (origin.project.pages.find((item) => item.id === origin.pageId) !== page) return null;
    createMotionTransport(engine).pause();
    return (held = { origin, preview: null });
  };
  return {
    subscribe: () =>
      engine.subscribe(() => {
        if (held && !current(held.origin)) cancel();
      }),
    preview(this: void, value: SpatialScene) {
      const session = begin();
      if (!session || !current(session.origin)) return cancel();
      const preview: PreviewValue = { target: "page", patch: { spatial: value } };
      session.preview = preview;
      store.set(previewAtom, preview);
    },
    commit(this: void, value: SpatialScene) {
      const session = begin();
      if (!session) return;
      const valid = current(session.origin);
      cancel();
      if (valid)
        run(() => {
          if (current(session.origin))
            engine.execute({ type: "updatePage", patch: { spatial: value } });
        });
    },
    cancel,
  };
}
/** One owned, imperative page draft; interrupted inputs never clear another control's draft. */
export function useScenePreview(
  engine: EnginePort,
  page: Composition,
  run: (task: () => void) => void,
) {
  const store = useStore();
  const edit = useMemo(
    () => createScenePreview(engine, page, store, run),
    [engine, page, store, run],
  );
  useEffect(() => {
    const stop = edit.subscribe();
    return () => {
      stop();
      edit.cancel();
    };
  }, [edit]);
  return edit;
}
