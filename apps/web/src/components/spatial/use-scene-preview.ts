import {
  captureSceneMotionEdit,
  isSceneMotionEditCurrent,
  sceneMotionCommands,
  sceneMotionPreview,
  type SceneMotionEdit,
} from "./scene-motion-edit";
import { useEffect, useMemo } from "react";
import { useStore } from "jotai";
import type {
  Composition,
  EnginePort,
  SceneMotionPropertyTarget,
  SpatialScene,
} from "@musart/core";
import type { PreviewValue } from "../../state/session/preview-source";
import { previewAtom } from "../../state/session/editor";
import { createMotionTransport } from "../../services/motion/transport";
function createScenePreview(
  engine: EnginePort,
  page: Composition,
  store: ReturnType<typeof useStore>,
  run: (task: () => void) => void,
  settings: SpatialScene,
) {
  let held: { origin: SceneMotionEdit; preview: PreviewValue | null } | null = null;
  const cancel = () => {
    if (held?.preview && store.get(previewAtom) === held.preview) store.set(previewAtom, null);
    held = null;
  };
  const current = (origin: SceneMotionEdit) => isSceneMotionEditCurrent(engine, origin);
  const begin = () => {
    if (held) return held;
    const snapshot = engine.getSnapshot();
    if (snapshot.project.pages.find((item) => item.id === snapshot.pageId) !== page) return null;
    const origin = captureSceneMotionEdit(engine, page, settings);
    return (held = { origin, preview: null });
  };
  return {
    begin,
    subscribe: () =>
      createMotionTransport(engine).subscribe(() => {
        if (held && !current(held.origin)) cancel();
      }),
    preview(this: void, value: SpatialScene, target?: SceneMotionPropertyTarget) {
      const session = begin();
      if (!session || !current(session.origin)) return cancel();
      const preview: PreviewValue = {
        target: "page",
        patch: { spatial: sceneMotionPreview(session.origin, value, target) },
      };
      session.preview = preview;
      store.set(previewAtom, preview);
    },
    commit(this: void, value: SpatialScene, target?: SceneMotionPropertyTarget) {
      const session = begin();
      if (!session) return;
      const valid = current(session.origin);
      cancel();
      if (valid)
        run(() => {
          if (current(session.origin))
            engine.transaction(sceneMotionCommands(engine, session.origin, value, target));
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
  settings: SpatialScene,
) {
  const store = useStore();
  const edit = useMemo(
    () => createScenePreview(engine, page, store, run, settings),
    [engine, page, store, run, settings],
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
