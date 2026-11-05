import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from "react";
import type { EnginePort } from "@musart/core";
import type { WorkspaceSource } from "../artboards/workspace";
import { createViewportActions } from "../session/viewport-actions";
import { createViewportResizeAnchor } from "../session/viewport-resize";
import { animatePresentationProgress } from "../../components/shared/motion/presentation-spring";
import { createResizeAnchor } from "./resize-anchor";
import { createViewportMetrics } from "./viewport-metrics";
import { ViewMotion } from "./motion";
import { immersiveView } from "./immersive";
import { useWorkspaceMode } from "../../ui/studio/workspace-mode";
import type { ArtboardWorkspace } from "../artboards/layout";
import {
  zoomAt,
  constrainView,
  fitView,
  INITIAL_VIEW,
  pan,
  wheelPixels,
  wheelZoomFactor,
  WHEEL_PAN_SPEED,
} from "./view";
const PAN_SETTLE_MS = 100;
interface PanIdle {
  timer: ReturnType<typeof setTimeout> | undefined;
}
function clearPanIdle(idle: PanIdle) {
  clearTimeout(idle.timer);
  idle.timer = undefined;
}

function createImmersiveMode() {
  let active = false;
  return {
    read: () => active,
    write: (next: boolean) => {
      active = next;
    },
  };
}

function createMotion(
  workspace: WorkspaceSource,
  metrics: ReturnType<typeof createViewportMetrics>,
  media: MediaQueryList,
  immersive: ReturnType<typeof createImmersiveMode>,
  engine: EnginePort,
) {
  return new ViewMotion({
    clock: {
      now: () => performance.now(),
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle),
    },
    reduced: () => media.matches,
    constrain: (next) => {
      return immersive.read()
        ? immersiveView(workspace.read(), metrics.read(), engine.getSnapshot().pageId, next)
        : constrainView(next, workspace.read(), metrics.read());
    },
  });
}

function createReservation(
  engine: EnginePort,
  workspace: WorkspaceSource,
  metrics: ReturnType<typeof createViewportMetrics>,
  media: MediaQueryList,
  motion: ViewMotion,
) {
  return createResizeAnchor({
    motion,
    rect: metrics.measure,
    workspace: () => workspace.read(),
    reduced: () => media.matches,
    spring: animatePresentationProgress,
    scope: () => engine.getSnapshot().project,
  });
}

export function useViewport({
  engine,
  workspace,
  viewport,
  layoutKey,
  projectId,
}: {
  engine: EnginePort;
  workspace: WorkspaceSource;
  viewport: RefObject<HTMLDivElement | null>;
  layoutKey: string;
  projectId: string;
}) {
  const studio = useWorkspaceMode() === "studio";
  const immersive = useMemo(() => createImmersiveMode(), []);
  const activeId = engine.getSnapshot().pageId;
  const remembered = useRef<{ projectId: string; mode: boolean } | null>(null);
  const classicView = useRef<ReturnType<typeof fitView> | null>(null);
  const media = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)"), []);
  const metrics = useMemo(() => createViewportMetrics(viewport), [viewport]);
  const motion = useMemo(
    () => createMotion(workspace, metrics, media, immersive, engine),
    [workspace, metrics, media, engine, immersive],
  );
  const view = useSyncExternalStore(
    motion.subscribeSettled,
    motion.readSettled,
    motion.readSettled,
  );
  const viewRef = useRef(view);
  const actions = useMemo(() => createViewportActions(engine), [engine]);
  const resizePort = useMemo(() => createViewportResizeAnchor(engine), [engine]);
  const resizeAnchor = useMemo(
    () => createReservation(engine, workspace, metrics, media, motion),
    [motion, metrics, workspace, media, engine],
  );
  const panIdle = useMemo<PanIdle>(() => ({ timer: undefined }), []);
  useLayoutEffect(() => {
    const previous = remembered.current;
    const rect = metrics.measure();
    if (previous?.projectId === projectId && !previous.mode && studio)
      classicView.current = motion.read();
    if (previous?.projectId !== projectId) classicView.current = null;
    immersive.write(studio);
    if (rect) {
      if (studio) motion.jump(immersiveView(workspace.read(), rect, activeId));
      else if (previous?.mode && previous.projectId === projectId)
        motion.jump(classicView.current ?? fitView(workspace.read(), rect));
    }
    remembered.current = { projectId, mode: studio };
  }, [studio, activeId, projectId, workspace, metrics, motion, immersive]);
  const previousLayout = useRef<{ projectId: string; layout: ArtboardWorkspace } | null>(null);
  useLayoutEffect(() => {
    const layout = workspace.read(),
      previous = previousLayout.current;
    previousLayout.current = { projectId, layout };
    if (!previous || previous.projectId !== projectId || previous.layout === layout) return;
    const rect = metrics.measure();
    if (!rect) return;
    if (immersive.read()) {
      motion.jump(immersiveView(layout, rect, engine.getSnapshot().pageId, motion.read()));
      return;
    }
    const shown = motion.read(),
      old = previous.layout;
    const rebased = {
      ...shown,
      x:
        shown.x +
        ((layout.origin?.x ?? 0) + layout.width / 2 - (old.origin?.x ?? 0) - old.width / 2) *
          shown.zoom,
      y:
        shown.y +
        ((layout.origin?.y ?? 0) + layout.height / 2 - (old.origin?.y ?? 0) - old.height / 2) *
          shown.zoom,
    };
    const removal =
      layout.boards.length < old.boards.length &&
      layout.boards.every((board) => old.boards.some((previous) => previous.id === board.id));
    if (removal) {
      const target = constrainView(rebased, layout, rect);
      motion.reframe(rebased, target === rebased);
      if (target !== rebased) motion.animateTo(target, true);
    } else {
      motion.reframe(rebased, false);
      motion.animateTo(fitView(layout, rect), true);
    }
  }, [motion, metrics, projectId, layoutKey, workspace, engine, immersive]);
  useEffect(() => {
    motion.activate();
    viewRef.current = motion.read();
    const stop = motion.subscribe(() => {
      viewRef.current = motion.read();
    });
    const changed = () => {
      if (media.matches) {
        resizeAnchor.finish();
        motion.finish();
      }
    };
    media.addEventListener("change", changed);
    return () => {
      stop();
      media.removeEventListener("change", changed);
      motion.dispose();
    };
  }, [motion, media, resizeAnchor]);
  useEffect(() => {
    const unregister = resizePort.register(resizeAnchor.capture);
    return () => {
      unregister();
      resizeAnchor.cancel();
    };
  }, [resizePort, resizeAnchor, projectId]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const rect = metrics.measure();
      if (rect)
        motion.jump(
          immersive.read()
            ? immersiveView(workspace.read(), rect, engine.getSnapshot().pageId)
            : fitView(workspace.read(), rect),
        );
    });
    return () => cancelAnimationFrame(frame);
  }, [motion, metrics, projectId, workspace, engine, immersive]);
  useEffect(
    () =>
      actions.subscribeFocus((target) => {
        clearPanIdle(panIdle);
        resizeAnchor.cancel();
        const rect = metrics.measure();
        if (!rect) return;
        const anchor = {
          x: target.x - rect.left - rect.width / 2,
          y: target.y - rect.top - rect.height / 2,
        };
        const next = zoomAt(motion.read(), target.factor, anchor);
        motion.animateTo({ ...next, x: next.x - anchor.x, y: next.y - anchor.y }, true);
      }),
    [actions, metrics, motion, panIdle, resizeAnchor],
  );
  useEffect(
    () =>
      actions.subscribe((action) => {
        clearPanIdle(panIdle);
        resizeAnchor.cancel();
        const handlers = {
          fit: () => {
            const rect = metrics.measure();
            if (rect)
              motion.animateTo(
                immersive.read()
                  ? immersiveView(workspace.read(), rect, engine.getSnapshot().pageId)
                  : fitView(workspace.read(), rect),
              );
          },
          reset: () => motion.animateTo(INITIAL_VIEW),
          recenter: () => {
            const rect = metrics.measure();
            motion.animateTo(
              immersive.read() && rect
                ? immersiveView(workspace.read(), rect, engine.getSnapshot().pageId)
                : { ...motion.read(), x: 0, y: 0 },
            );
          },
          zoomIn: () => motion.zoomBy(1.2, { x: 0, y: 0 }),
          zoomOut: () => motion.zoomBy(1 / 1.2, { x: 0, y: 0 }),
        };
        handlers[action]();
      }),
    [actions, workspace, motion, metrics, panIdle, resizeAnchor, engine, immersive],
  );
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      resizeAnchor.cancel();
      clearPanIdle(panIdle);
      const rect = metrics.measure();
      if (!rect) return;
      if (event.ctrlKey || event.metaKey)
        motion.zoomWheel(wheelZoomFactor(event.deltaY, event.deltaMode, rect.height), {
          x: event.clientX - rect.left - rect.width / 2,
          y: event.clientY - rect.top - rect.height / 2,
        });
      else {
        motion.stop(false);
        const dx = wheelPixels(event.deltaX, event.deltaMode, rect.width) * WHEEL_PAN_SPEED,
          dy = wheelPixels(event.deltaY, event.deltaMode, rect.height) * WHEEL_PAN_SPEED;
        motion.jump(
          pan(
            motion.read(),
            event.shiftKey && dx === 0 ? dy : dx,
            event.shiftKey && dx === 0 ? 0 : dy,
          ),
          false,
        );
        panIdle.timer = setTimeout(() => {
          panIdle.timer = undefined;
          motion.stop();
        }, PAN_SETTLE_MS);
      }
    };
    let observedSize = metrics.read();
    const observer = new ResizeObserver(() => {
      const rect = metrics.measure();
      if (!rect) return;
      const resized = rect.width !== observedSize.width || rect.height !== observedSize.height;
      observedSize = metrics.read();
      if (!resizeAnchor.resizeHandled())
        motion.jump(
          immersive.read() && resized
            ? immersiveView(workspace.read(), rect, engine.getSnapshot().pageId)
            : motion.read(),
        );
    });
    const interrupt = () => {
      clearPanIdle(panIdle);
      resizeAnchor.cancel();
      motion.stop();
    };
    observer.observe(element);
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("pointerdown", interrupt, true);
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("pointerdown", interrupt, true);
      clearPanIdle(panIdle);
    };
  }, [motion, viewport, metrics, panIdle, resizeAnchor, immersive, workspace, engine]);
  return { view, viewRef, motion, actions };
}
