import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { DragEvent } from "react";
import type { Composition, EnginePort } from "@musart/core";
import { useLayerDrag } from "../../layers/drag/use-layer-drag";
import { layerDragController } from "../../layers/drag/controller";
import { layerDragDiagnostics } from "../../layers/drag/diagnostics";
import { layerDragWindow } from "../../layers/drag/window";
import { formatUiError } from "../../../state/i18n/errors/format";
import { createTimelineLayerPointer } from "./pointer";
import type { TimelineGestures } from "../gestures";
import type { TimelineTransport } from "../model";
import { projectTimelineRows, type TimelineRow } from "../tree";
import { readTimelinePage, useTimelineSource } from "../rows/timeline-source";

/** Both timeline surfaces project the same engine-owned layer drag as the Layers panel. */
export function useTimelineLayerDrag(options: {
  engine: EnginePort;
  page: Composition;
  collapsed: ReadonlySet<string>;
  transport: TimelineTransport;
  gestures: TimelineGestures;
  active: boolean;
  details?: boolean;
  onError: (message: string) => void;
  chosenOccurrences?: ReadonlyMap<string, string>;
}) {
  const { engine, page, collapsed, transport, gestures, active, onError } = options;
  const run = useCallback(
    (action: () => void) => {
      try {
        action();
      } catch (error) {
        onError(formatUiError(error));
      }
    },
    [onError],
  );
  const { layers, pageId, target, rejected, dragging, cancel, cancelOwned, clearTarget, handlers } =
    useLayerDrag(page, engine, run);
  const source = useTimelineSource(page);
  const livePage = useRef(page);
  useLayoutEffect(() => {
    livePage.current = page;
  }, [page]);
  // Render data stays immutable; native events delegate to the latest committed adapter.
  const liveHandlers = useRef(handlers);
  useLayoutEffect(() => {
    liveHandlers.current = handlers;
  }, [handlers]);
  const delegates = useMemo<typeof handlers>(
    () => ({
      start: (...args) => {
        const current = readTimelinePage(engine, source);
        if (!current || (args[2] && args[2] !== current)) {
          args[0].preventDefault();
          return;
        }
        liveHandlers.current.start(args[0], args[1], current);
      },
      over: (...args) => {
        const current = readTimelinePage(engine, source);
        if (!current || (args[2] && args[2] !== current)) {
          args[0].dataTransfer.dropEffect = "none";
          return;
        }
        liveHandlers.current.over(args[0], args[1], current);
      },
      overTree: (...args) => liveHandlers.current.overTree(...args),
      drop: (...args) => {
        const current = readTimelinePage(engine, source);
        if (!current || (args[2] && args[2] !== current)) {
          args[0].preventDefault();
          cancelOwned();
          return;
        }
        liveHandlers.current.drop(args[0], args[1], current);
      },
    }),
    [engine, source, cancelOwned],
  );
  const native = useMemo(
    () => ({
      layers,
      pageId,
      target,
      rejected,
      dragging,
      cancel,
      cancelOwned,
      clearTarget,
      handlers: delegates,
      ...delegates,
    }),
    [layers, pageId, target, rejected, dragging, cancel, cancelOwned, clearTarget, delegates],
  );
  const pointer = useMemo(
    () =>
      createTimelineLayerPointer({
        engine,
        transport,
        compositionId: page.id,
        gestures,
        run,
        onError,
      }),
    [engine, transport, page.id, gestures, run, onError],
  );
  useEffect(() => () => pointer.dispose(), [pointer]);
  useEffect(() => {
    if (!active) {
      pointer.cancel();
      cancelOwned();
    }
  }, [active, pointer, cancelOwned]);
  const canonical = useMemo(() => {
    const current = readTimelinePage(engine, source);
    return current
      ? projectTimelineRows(current, collapsed, options.chosenOccurrences, options.details)
      : [];
  }, [engine, source, collapsed, options.chosenOccurrences, options.details]);
  const moving = dragging !== null && pageId === page.id;
  const rows = canonical;
  const controller = useMemo(() => layerDragController(engine), [engine]);
  const rejectProperty = useCallback(
    (event: DragEvent<HTMLElement>, id: string) => {
      event.stopPropagation();
      event.dataTransfer.dropEffect = "none";
      controller.clear({ id, reason: "property" });
      if (controller.read())
        layerDragDiagnostics(engine).refuse("nativeDragover", "property", id, event);
    },
    [controller, engine],
  );
  const window = useCallback(
    (first: number, last: number) => {
      return layerDragWindow<TimelineRow>(rows, canonical, first, last, moving ? dragging : null);
    },
    [rows, canonical, moving, dragging],
  );
  return useMemo(
    () => ({
      rows,
      canonical,
      native,
      pointer,
      moving,
      get page() {
        // Consumers use this only to identify a row or begin a native action.
        return readTimelinePage(engine, source) ?? livePage.current;
      },
      target: moving ? target : null,
      rejected: moving ? rejected : null,
      dragging: moving ? dragging : null,
      rejectProperty,
      window,
    }),
    [
      rows,
      canonical,
      native,
      pointer,
      moving,
      engine,
      source,
      target,
      rejected,
      dragging,
      rejectProperty,
      window,
    ],
  );
}

export type TimelineLayerDrag = ReturnType<typeof useTimelineLayerDrag>;
