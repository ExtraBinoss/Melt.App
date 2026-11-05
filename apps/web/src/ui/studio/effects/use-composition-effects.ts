import { useCallback, useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import type { Composition, Effect, EnginePort, SessionSnapshot } from "@musart/core";
import { previewAtom } from "../../../state/session/editor";
import { motionTimeChanges } from "../../../state/session/motion-edit";

/** Owned imperative drafts cancel on document, selection, clock and surface changes. */
export function useCompositionEffects(
  engine: EnginePort,
  page: Composition,
  run: (task: () => void) => void,
) {
  const setPreview = useSetAtom(previewAtom);
  const held = useRef<SessionSnapshot | null>(null);
  const mounted = useRef(true);
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
    held.current = null;
    setPreview(null);
  }, [setPreview]);
  useEffect(() => {
    mounted.current = true;
    const stop = engine.subscribe(() => {
      if (held.current && !valid(held.current)) cancel();
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
    held.current ??= engine.getSnapshot();
  }
  function change(effects: Effect[], preview = false) {
    begin();
    const origin = held.current!;
    if (
      !mounted.current ||
      !valid(origin) ||
      origin.project.pages.find((item) => item.id === page.id) !== page
    )
      return cancel();
    if (preview) setPreview({ target: "page", patch: { effects } });
    else {
      cancel();
      run(() => {
        if (valid(origin)) engine.execute({ type: "updatePage", patch: { effects } });
      });
    }
  }
  return { begin, start: begin, cancel, change };
}
