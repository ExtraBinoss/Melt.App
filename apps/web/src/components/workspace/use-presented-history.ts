import {
  startTransition,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { EnginePort } from "@musart/core";
import {
  getCanonicalPresentation,
  type CanonicalOrigin,
} from "../../state/session/canonical-presentation";

interface PresentationScheduler {
  postTask(
    task: () => void,
    options: { priority: "background"; signal: AbortSignal },
  ): Promise<void>;
}

/** Leave a browser presentation opportunity after drawing, then yield admission to queued input. */
function afterPresentedFrame(admit: () => void): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    if (!signal.aborted) admit();
  };
  const fallback = () => {
    if (!signal.aborted) timer = setTimeout(run, 0);
  };
  // The draw finishes inside a rendering step. Cross that step, leave two further
  // frame opportunities free of a cold controls commit, then admit as background work.
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const scheduler = (globalThis as typeof globalThis & { scheduler?: PresentationScheduler })
          .scheduler;
        if (scheduler?.postTask)
          void scheduler.postTask(run, { priority: "background", signal }).catch(fallback);
        else fallback();
      });
    });
  });
  return () => {
    controller.abort();
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}

/** History controls yield to a canonical draw and browser paint without delaying the document. */
export function usePresentedHistory<T>(
  engine: EnginePort,
  value: T,
  origin: CanonicalOrigin | null,
): T {
  const presentation = useMemo(() => getCanonicalPresentation(engine), [engine]);
  const read = useCallback(() => {
    if (!origin) return "immediate";
    const state = presentation.read();
    // Headless consumers and unavailable renderers cannot leave controls waiting forever.
    if (!state.available) return "immediate";
    return state.requested?.projectId === origin.projectId &&
      state.requested.revision === origin.revision &&
      state.presented?.projectId === origin.projectId &&
      state.presented.revision === origin.revision &&
      presentation.ready(origin)
      ? "drawn"
      : "waiting";
  }, [origin, presentation]);
  const subscribe = useCallback(
    (listener: () => void) => (origin ? presentation.subscribe(listener) : () => {}),
    [origin, presentation],
  );
  const status = useSyncExternalStore(subscribe, read, read);
  const [retained, setRetained] = useState(() => ({ engine, value }));
  const [admitted, setAdmitted] = useState(() => ({ engine, value, origin }));
  const adopted =
    admitted.engine === engine &&
    admitted.value === value &&
    admitted.origin?.projectId === origin?.projectId &&
    admitted.origin?.revision === origin?.revision;
  const shown =
    status === "immediate" || retained.engine !== engine || adopted ? value : retained.value;
  if (retained.engine !== engine || retained.value !== shown) setRetained({ engine, value: shown });
  useLayoutEffect(() => {
    if (status !== "drawn" || adopted) return;
    return afterPresentedFrame(() => {
      // A newer canonical request can arrive before React commits its replacement controls.
      if (read() === "drawn") startTransition(() => setAdmitted({ engine, value, origin }));
    });
  }, [adopted, engine, origin, read, status, value]);
  return shown;
}
