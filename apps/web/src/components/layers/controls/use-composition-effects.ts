import { useCallback, useEffect, useRef } from "react";
import { useStore } from "jotai";
import type {
  Composition,
  Effect,
  EnginePort,
  SessionSnapshot,
  SceneMotionPropertyTarget,
} from "@musart/core";
import type { PreviewValue } from "../../../state/session/preview-source";
import { previewAtom } from "../../../state/session/editor";
import {
  captureMotionEdit,
  isMotionEditCurrent,
  motionTimeChanges,
  type MotionEditOrigin,
} from "../../../state/session/motion-edit";
import { createMotionTransport } from "../../../services/motion/transport";
import {
  compositionEffectsMotionCommands,
  compositionEffectsMotionPreview,
} from "./composition-effects-motion";

/** Owned imperative drafts cancel on document, selection, clock and surface changes. */
export function useCompositionEffects(
  engine: EnginePort,
  page: Composition,
  run: (task: () => void) => void,
) {
  const store = useStore();
  const owned = useRef<PreviewValue | null>(null);
  const held = useRef<SessionSnapshot | null>(null);
  const motionOrigin = useRef<MotionEditOrigin | null>(null);
  const hint = useRef<SceneMotionPropertyTarget | undefined>(undefined);
  const mounted = useRef(true);
  const generation = useRef(0);
  const valid = useCallback(
    (origin: SessionSnapshot) => {
      const next = engine.getSnapshot();
      return (
        next.project === origin.project &&
        next.pageId === page.id &&
        next.revision === origin.revision &&
        next.selection === origin.selection
      );
    },
    [engine, page.id],
  );
  const cancel = useCallback(() => {
    generation.current++;
    held.current = null;
    motionOrigin.current = null;
    hint.current = undefined;
    if (owned.current && store.get(previewAtom) === owned.current) store.set(previewAtom, null);
    owned.current = null;
  }, [store]);
  useEffect(() => {
    mounted.current = true;
    const stop = engine.subscribe(() => {
      if (held.current && !valid(held.current)) cancel();
      else generation.current++;
    });
    const stopClock = motionTimeChanges(engine).subscribe(cancel);
    return () => {
      mounted.current = false;
      stop();
      stopClock();
      cancel();
    };
  }, [engine, valid, cancel]);
  function begin() {
    if (!held.current) {
      motionOrigin.current = captureMotionEdit(engine);
      held.current = motionOrigin.current.snapshot;
    }
  }
  function beginScene(target: SceneMotionPropertyTarget) {
    begin();
    hint.current = target;
  }
  function change(effects: Effect[], preview = false) {
    begin();
    const origin = held.current!;
    const edit = motionOrigin.current!;
    const target = hint.current;
    if (
      !mounted.current ||
      !valid(origin) ||
      !isMotionEditCurrent(engine, edit) ||
      origin.project.pages.find((item) => item.id === page.id) !== page
    )
      return cancel();
    if (preview) {
      const frame = createMotionTransport(engine).readFrame() ?? page;
      owned.current = {
        target: "page",
        patch: {
          effects:
            edit.mode === "motion"
              ? compositionEffectsMotionPreview(page, frame, effects, target)
              : effects,
        },
      };
      store.set(previewAtom, owned.current);
    } else {
      const commands = compositionEffectsMotionCommands(page, effects, edit, target);
      cancel();
      const current = generation.current;
      run(() => {
        if (
          commands.length &&
          current === generation.current &&
          valid(origin) &&
          isMotionEditCurrent(engine, edit)
        )
          engine.transaction(commands);
      });
    }
  }
  return { begin, start: begin, beginScene, cancel, change };
}
