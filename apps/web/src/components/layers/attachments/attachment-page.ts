import { useCallback, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Composition, EnginePort } from "@musart/core";
import { resolveLayerPage } from "../tree/activation";
import { samePageEditingScope } from "../../../state/session/page-editing-scope";

export interface AttachmentPagePort {
  readonly projectId: string;
  readonly pageId: string;
  readonly layerId: string;
  read(): Composition | null;
  bind(page: Composition): () => void;
}

function createAttachmentPagePort(
  engine: EnginePort,
  projectId: string,
  pageId: string,
  layerId: string,
): AttachmentPagePort {
  let bound: WeakRef<Composition> | undefined;
  return {
    projectId,
    pageId,
    layerId,
    read() {
      const source = bound?.deref();
      return source && engine.getSnapshot().project.id === projectId
        ? resolveLayerPage(engine, source)
        : null;
    },
    bind(source) {
      const next = new WeakRef(source);
      bound = next;
      return () => {
        if (bound === next) bound = undefined;
      };
    },
  };
}

/** Closed badges keep no obsolete page graph. Only committed wrappers can replace their owner. */
export function useAttachmentPagePort(engine: EnginePort, page: Composition, layerId: string) {
  const readProjectId = useCallback(() => engine.getSnapshot().project.id, [engine]);
  const projectId = useSyncExternalStore(engine.subscribe, readProjectId, readProjectId);
  const pageId = page.id;
  const port = useMemo(
    () => createAttachmentPagePort(engine, projectId, pageId, layerId),
    [engine, projectId, pageId, layerId],
  );
  useLayoutEffect(() => port.bind(page), [port, page]);
  return port;
}

export type AttachmentPageInput =
  | { page: Composition; pagePort?: never }
  | { page?: Composition; pagePort: AttachmentPagePort };

/** External-store cache, independent from React's render phase. */
function createAttachmentReader(engine: EnginePort, source: Composition | null) {
  let previous: Composition | null = null;
  return () => {
    const current = source ? resolveLayerPage(engine, source) : null;
    if (previous && current && samePageEditingScope(previous, current)) return previous;
    previous = current;
    return current;
  };
}

/** Port reads are admission only. Open drafts remain pinned to their captured immutable page. */
export function useAttachmentPage(
  engine: EnginePort,
  page: Composition | undefined,
  port: AttachmentPagePort | undefined,
  open: boolean,
) {
  const [captured, setCaptured] = useState<WeakRef<Composition> | null>(null);
  const candidate = page ?? (open ? (captured?.deref() ?? null) : null);
  const [retained, setRetained] = useState(candidate);
  const source =
    retained && candidate && samePageEditingScope(retained, candidate) ? retained : candidate;
  if (retained !== source) setRetained(source);
  const subscribe = useCallback(
    (listener: () => void) => (open ? engine.subscribe(listener) : () => {}),
    [engine, open],
  );
  const read = useMemo(() => createAttachmentReader(engine, source), [engine, source]);
  const current = useSyncExternalStore(subscribe, read, read);
  return {
    source,
    current,
    capture: () => {
      const next = page ? resolveLayerPage(engine, page) : (port?.read() ?? null);
      if (next) setCaptured(new WeakRef(next));
      return next;
    },
  };
}
