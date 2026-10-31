import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { AnimatePresence } from "motion/react";
import { VectorEditEntry } from "./VectorEditEntry";
import type { VectorEditorHandle } from "../../components/properties/vector/VectorEditor";
import type { EnginePort, VectorDefinition } from "@musart/core";
import { useEngine } from "../../state/session/editor";
import { vectorEditingAtom, vectorEditingTarget } from "../../state/session/vector-editing";
import { createMotionTransport } from "../../services/motion/transport";
import { clientToPage } from "../viewport/view";
import type { ViewSource } from "../viewport/motion";
import type { SceneController } from "../session/scene-controller";
import { canvasHit } from "../selection/hit";
import { editableVector } from "./geometry";
import "../../components/properties/vector/messages";
import "../../components/properties/vector/vector-editor.css";
const VectorEditor = lazy(() => import("../../components/properties/vector/VectorEditor"));

function restoreCanvasFocus(viewport: RefObject<HTMLDivElement | null>) {
  if (
    document.activeElement === viewport.current ||
    document.activeElement?.closest(".vector-editor-inline")
  )
    viewport.current?.focus({ preventScroll: true });
}

/** Canonical selection owns a small leaf; node previews use the retained scene port. */
export function CanvasVectorEditing({
  engine,
  controller,
  viewSource,
  viewport,
  enabled,
}: {
  engine: EnginePort;
  controller: SceneController;
  viewSource: ViewSource;
  viewport: RefObject<HTMLDivElement | null>;
  enabled: boolean;
}) {
  const snapshot = useEngine(engine),
    { t } = useTranslation("vectorEditor");
  const [editing, setEditing] = useAtom(vectorEditingAtom(engine));
  const page = snapshot.project.pages.find((p) => p.id === snapshot.pageId)!;
  const layer =
    snapshot.selection.length === 1 ? editableVector(page, snapshot.selection[0]) : null;
  const editor = useRef<VectorEditorHandle>(null);
  const playback = useSyncExternalStore(controller.subscribe, () =>
    Boolean(controller.read().playback),
  );
  const matchesScope =
    editing?.projectId === snapshot.project.id && editing?.pageId === snapshot.pageId;
  const active = enabled && !playback && layer && matchesScope && editing?.layerId === layer.id;
  const cancel = useCallback(() => controller.setGesture([]), [controller]);
  const surface = useMemo(
    () => ({ engine, controller, view: viewSource, viewport, layerId: layer?.id ?? "" }),
    [engine, controller, viewSource, viewport, layer?.id],
  );
  const done = useCallback(() => {
    setEditing(null);
    controller.setGesture([]);
    restoreCanvasFocus(viewport);
  }, [setEditing, controller, viewport]);
  useEffect(() => {
    if (
      editing &&
      (!enabled || playback || !layer || !matchesScope || editing.layerId !== layer.id)
    )
      setEditing(null);
  }, [editing, enabled, playback, layer, setEditing, matchesScope]);
  useEffect(() => {
    const element = viewport.current;
    if (!element || !enabled || !layer) return;
    const doubleClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        controller.read().playback ||
        (event.target as Element).closest("[data-canvas-control]")
      )
        return;
      const frame = controller.read(),
        point = clientToPage(
          { x: event.clientX, y: event.clientY },
          element.getBoundingClientRect(),
          viewSource.read(),
          frame.page,
        );
      if (canvasHit(frame.page, point)?.layer.id !== layer.id) return;
      event.preventDefault();
      createMotionTransport(engine).pause();
      setEditing(vectorEditingTarget(engine, layer.id));
      element.focus({ preventScroll: true });
    };
    element.addEventListener("dblclick", doubleClick);
    return () => element.removeEventListener("dblclick", doubleClick);
  }, [engine, enabled, layer, controller, viewSource, viewport, setEditing]);
  useEffect(() => {
    if (!active) return;
    const key = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        (event.target as Element)?.closest?.(
          '[data-vector-stage],.vector-editor-inline,[data-slot="popover-content"]',
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!editor.current?.cancelGesture()) done();
    };
    // The canvas itself receives Escape while no individual anchor is focused.
    const element = viewport.current;
    element?.addEventListener("keydown", key, true);
    return () => element?.removeEventListener("keydown", key, true);
  }, [active, done, viewport]);
  useEffect(() => () => setEditing(null), [engine, setEditing]);
  function valid() {
    const fresh = engine.getSnapshot(),
      current = fresh.project.pages.find((p) => p.id === fresh.pageId);
    return (
      layer &&
      fresh.project.id === snapshot.project.id &&
      fresh.pageId === snapshot.pageId &&
      fresh.selection.length === 1 &&
      fresh.selection[0] === layer!.id &&
      current &&
      editableVector(current, layer!.id)?.vector === layer!.vector
    );
  }
  function preview(vector: VectorDefinition) {
    if (valid()) controller.setGesture([{ layerId: layer!.id, patch: { vector } }]);
  }
  function commit(vector: VectorDefinition) {
    if (!valid()) throw new Error("STALE_VECTOR_EDIT");
    try {
      engine.execute({ type: "updateLayers", ids: [layer!.id], patch: { vector } });
    } finally {
      controller.setGesture([]);
    }
  }
  return (
    <>
      <AnimatePresence>
        {enabled && layer && !playback && !active && (
          <VectorEditEntry
            key={`${snapshot.project.id}:${page.id}:${layer.id}`}
            controller={controller}
            view={viewSource}
            viewport={viewport}
            layerId={layer.id}
            onEdit={() => {
              createMotionTransport(engine).pause();
              setEditing(vectorEditingTarget(engine, layer.id));
              viewport.current?.focus({ preventScroll: true });
            }}
          />
        )}
      </AnimatePresence>
      {active && layer && (
        <Suspense
          fallback={
            <aside
              className="vector-canvas-toolbar floating-panel"
              data-canvas-control
              role="status"
            >
              {t("loading")}
            </aside>
          }
        >
          <VectorEditor
            ref={editor}
            key={`${snapshot.project.id}:${page.id}:${layer.id}`}
            surface={surface}
            vector={layer.vector!}
            fill={layer.fill}
            stroke={layer.stroke}
            onPreview={preview}
            onCommit={commit}
            onCancel={cancel}
            onDone={done}
          />
        </Suspense>
      )}
    </>
  );
}
