import { SelectionTools, PixelSelectionToolbar } from "./selection/SelectionTools";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useStore, useAtomValue } from "jotai";
import { marqueeContainAtom } from "../state/selection/preferences";
import type { EditorCanvasProps } from "./session/canvas-contracts";
export type { EditorCanvasProps } from "./session/canvas-contracts";
import { shapeChoiceAtom } from "../components/assets/selection";
import { createArtworkLayer } from "./interaction/shapes";
import { completeDrawing, resizeDrawing } from "./interaction/drawing";
import { createTextDrawing, commitDrawing } from "./interaction/text-insertion";
import { textInsertionModeAtom } from "../state/session/text-insertion";
import { toolAtom } from "../state/session/editor";
import { keepCreationToolAtom } from "../state/tools/preferences";
import { useCanvasTransfers } from "./interaction/library-drop";
import { CanvasContextMenu } from "./selection/CanvasContextMenu";
import { readReleasePoint } from "./interaction/release";
import { canvasNavigationKeys, canvasNavigationKeyDown } from "./interaction/keyboard-navigation";
import { useTranslation } from "react-i18next";
import {
  createLayer,
  createLayerGeometryIndex,
  backgroundLayer,
  invertMatrix,
  transformPoint,
  type Layer,
} from "@musart/core";
import { EditorScene } from "./render/EditorScene";
import { SceneController } from "./session/scene-controller";
import { createCanvasView } from "./session/view-state";
import { useRenderMetrics } from "../state/session/render-metrics";
import { EMPTY_PREVIEW_SOURCE } from "../state/session/preview-source";
import {
  clickSelection,
  selectedRoots,
  type Handle,
  type LayerPatch,
} from "./interaction/gestures";
import { clientToPage, type Point } from "./viewport/view";
import type { Gesture } from "./interaction/gesture-state";
import { useCanvasEffectInput } from "./interaction/effect-input";
import { installTouchNavigation } from "./viewport/touch-navigation";
import { useViewport } from "./viewport/use-viewport";
import { ViewportControls } from "./viewport/ViewportControls";
import { createWorkspace, createArtboardView } from "./artboards/workspace";
import { artboardAt, viewForArtboard } from "./artboards/layout";
import { artboardStyle } from "./artboards/presentation";
import { ArtboardControls } from "./artboards/ArtboardControls";
import { InactiveArtboards } from "./artboards/InactiveArtboards";
import { captureGestureOrigin } from "./interaction/gesture-origin";
import {
  captureTransformAuthoring,
  isTransformAuthoringCurrent,
  transformAuthoringCommands,
  watchTransformAuthoring,
} from "./interaction/transform-authoring";
import "./artboards/artboards.css";
import { QuickAdd } from "./quick-add/QuickAdd";
import { CanvasSelection } from "./selection/CanvasSelection";
import { useWorkspaceMode } from "../ui/studio/workspace-mode";
import { useCanvasHover } from "./selection/use-canvas-hover";
import { sourcePagePoint, sourceSelectionBounds } from "./selection/frame-geometry";
import { canvasHit } from "./selection/hit";
import * as pointerPick from "./interaction/pointer-pick";
import { editablePresentedLayer, pickMotionPlayback } from "./selection/presented-pick";
import { useMarquee } from "./selection/use-marquee";
import { useLiveMarquee } from "./selection/use-live-marquee";
import * as marqueeScope from "./selection/marquee-scope";
import { useCanvasPresentation } from "./viewport/use-canvas-presentation";
import { CanvasRulers } from "./guides/CanvasRulers";
import { Measurements } from "./guides/Measurements";
import { useWand } from "./interaction/use-wand";
import { attachmentSelection } from "../state/selection/attachments";
import { useTransformSnapping } from "./interaction/snapping/use-transform-snapping";
import { CanvasMarquee } from "./selection/CanvasMarquee";
import { CanvasObjectEditing } from "./shared/CanvasObjectEditing";
import { EffectGizmo } from "./effects/EffectGizmo";
import "./canvas.css";
export type { Tool } from "./interaction/gestures";
export function EditorCanvas({
  engine,
  tool,
  previewSource = EMPTY_PREVIEW_SOURCE,
  onError,
  onDropFiles,
  onImagePoint,
  fontResolver,
  services,
}: EditorCanvasProps) {
  const { t } = useTranslation();
  const store = useStore();
  const viewSource = useMemo(() => createCanvasView(engine), [engine]);
  const snapshot = useSyncExternalStore(viewSource.subscribe, viewSource.read, viewSource.read);
  const controller = useMemo(
    () => new SceneController(engine, previewSource),
    [engine, previewSource],
  );
  const page =
    snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
    snapshot.project.pages[0]!;
  const workspace = useMemo(() => createWorkspace(engine, controller), [engine, controller]);
  const layout = workspace.read();
  const layoutKey = JSON.stringify(
    snapshot.project.pages.map((item) => [item.id, item.width, item.height, item.canvasPosition]),
  );
  const viewport = useRef<HTMLDivElement>(null);
  useRenderMetrics(viewport);
  const {
    view,
    viewRef,
    motion,
    actions: viewportActions,
  } = useViewport({ engine, workspace, viewport, layoutKey, projectId: snapshot.project.id });
  const pageViewSource = useMemo(() => createArtboardView(workspace, motion), [workspace, motion]);
  const activeBoard = layout.boards.find((board) => board.id === page.id)!;
  const shown = motion.read();
  const pageView = viewForArtboard(shown, layout, activeBoard);
  const gesture = useRef<Gesture | null>(null);
  const patchesRef = useRef<LayerPatch[]>([]);
  const { feedback: snapFeedback, update: updateTransform } = useTransformSnapping({
    engine,
    controller,
    view: pageViewSource,
    gesture,
    patches: patchesRef,
  });
  const marqueeElement = useRef<HTMLDivElement>(null);
  const marquee = useMarquee(marqueeElement);
  const liveMarquee = useLiveMarquee(engine, controller);
  const containMarquee = useAtomValue(marqueeContainAtom);
  const [space, setSpace] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const studio = useWorkspaceMode() === "studio";
  const hoverEnabled = tool === "pointer" && !space;
  useCanvasHover(viewport, engine, controller, pageViewSource, hoverEnabled, gesture, studio);
  const wand = useWand({ port: services?.pixelSelection, store, tool, onError });
  const cancelWand = wand.cancel;
  const pixelSelection = services?.pixelSelection;
  const cancelGesture = useCallback(
    (capturedPointerId?: number, completed = false) => {
      liveMarquee.cancel();
      cancelWand();
      const active = gesture.current;
      const pointerId = active?.pointerId ?? capturedPointerId;
      gesture.current = null;
      const restore =
        !completed && active?.mode === "pan" && isTransformAuthoringCurrent(engine, active);
      if (restore && active) motion.jump(active.view);
      if (pointerId !== undefined && viewport.current?.hasPointerCapture(pointerId))
        viewport.current.releasePointerCapture(pointerId);
      patchesRef.current = [];
      snapFeedback.clear();
      motion.stop();
      controller.setGesture([]);
      marquee.clear();
    },
    [engine, motion, controller, cancelWand, snapFeedback, marquee, liveMarquee],
  );
  useCanvasEffectInput(engine, viewport, controller, pageViewSource, cancelGesture);
  useEffect(
    () =>
      viewport.current
        ? installTouchNavigation(viewport.current, motion, cancelGesture)
        : undefined,
    [motion, cancelGesture],
  );
  const beforePaint = useCallback(() => {
    if (controller.read().playback && pixelSelection?.read()) pixelSelection.deselect();
    if (
      gesture.current &&
      (!isTransformAuthoringCurrent(engine, gesture.current) || controller.read().playback)
    )
      cancelGesture();
  }, [engine, controller, cancelGesture, pixelSelection]);
  useEffect(
    () => watchTransformAuthoring(engine, () => gesture.current, cancelGesture),
    [engine, cancelGesture],
  );
  useCanvasPresentation({ controller, workspace, motion, viewport, beforePaint });
  function pagePoint(event: { clientX: number; clientY: number }): Point {
    return sourcePagePoint(controller, viewport.current!, pageViewSource, event);
  }
  function beginHandle(event: ReactPointerEvent, layer: Layer, handle: Handle) {
    event.preventDefault();
    event.stopPropagation();
    pointerPick.captureCanvasPointer(viewport.current, event.pointerId);
    const point = pagePoint(event);
    gesture.current = {
      ...captureTransformAuthoring(engine),
      presentation: controller.read().page,
      pointerId: event.pointerId,
      mode: "resize",
      backgroundLayerId: studio ? backgroundLayer(controller.read().page)?.id : undefined,
      from: point,
      current: point,
      client: { x: event.clientX, y: event.clientY },
      view: viewRef.current,
      layers: [layer],
      handle,
      selectionBounds: sourceSelectionBounds(controller, layer, viewport.current),
    };
  }
  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    if (gesture.current && gesture.current.pointerId !== event.pointerId) return;
    const layer = editablePresentedLayer(controller.read(), event.currentTarget.dataset.layerId);
    const handle = event.currentTarget.dataset.handle as Handle;
    if (layer) beginHandle(event, layer, handle);
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button < 0 || event.button > 2) return;
    if (gesture.current && gesture.current.pointerId !== event.pointerId) return;
    if ((event.target as HTMLElement).closest("[data-canvas-control]")) return;
    const frame = controller.read();
    if (frame.playback) {
      event.preventDefault();
      if (tool === "pointer") pickMotionPlayback(engine, frame, pagePoint(event), event);
      return;
    }
    event.preventDefault();
    pointerPick.captureCanvasPointer(viewport.current, event.pointerId);
    const point = pagePoint(event);
    const base = {
      origin: captureGestureOrigin(engine),
      presentation: controller.read().page,
      pointerId: event.pointerId,
      from: point,
      current: point,
      client: { x: event.clientX, y: event.clientY },
      view: viewRef.current,
      layers: [] as Layer[],
    };
    if (pointerPick.canvasPointerPans(event.button, tool, space, studio)) {
      gesture.current = { ...base, mode: "pan" };
      return;
    }
    const world = workspace.read();
    const worldPoint = clientToPage(
      { x: event.clientX, y: event.clientY },
      viewport.current!.getBoundingClientRect(),
      motion.read(),
      world,
    );
    const targetBoard = artboardAt(world, worldPoint);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (event.button === 2) {
      gesture.current = {
        ...base,
        mode: "box",
        boxSelection: marqueeScope.intersectingMarquee(
          engine,
          additive,
          targetBoard?.id,
          !containMarquee,
        ),
      };
      return;
    }
    attachmentSelection(engine).clear();
    if (targetBoard && targetBoard.id !== controller.read().page.id) {
      engine.setPage(targetBoard.id);
      const hit = canvasHit(
        controller.read().page,
        {
          x: worldPoint.x - targetBoard.x,
          y: worldPoint.y - targetBoard.y,
        },
        tool === "pointer",
      )?.layer;
      engine.select(hit ? [hit.id] : []);
      return;
    }
    if (!targetBoard && tool !== "pointer") return;
    if (tool === "shape" || tool === "rectangle" || tool === "ellipse" || tool === "text") {
      const shape =
        tool === "shape"
          ? createArtworkLayer(store.get(shapeChoiceAtom), point)
          : tool === "text"
            ? createTextDrawing(
                point,
                t("newText"),
                store.get(textInsertionModeAtom) ?? (studio ? "3d" : "2d"),
              )
            : createLayer(tool, {
                x: point.x,
                y: point.y,
                width: 1,
                height: 1,
                fill: "#2563eb",
                radius: tool === "rectangle" ? 12 : 0,
              });
      controller.setGesture([], shape);
      gesture.current = { ...base, mode: "draw", shape };
      return;
    }
    const currentPage = controller.read().page;
    const picked = pointerPick.pickCanvasPointer(engine, controller, point, tool, additive, studio),
      hit = picked?.layer;
    if (tool === "wand" || tool === "segment") {
      if (hit?.kind === "image") {
        engine.select([hit.id]);
        const local = transformPoint(
          invertMatrix(createLayerGeometryIndex(currentPage).worldMatrix(hit.id)),
          point,
        );
        if (tool === "segment") onImagePoint?.(hit.id, local.x, local.y);
        else if (!wand.begin(event, hit.id, local.x, local.y)) onError?.(t("selectImageFirst"));
      } else onError?.(t("selectImageFirst"));
      return;
    }
    if (!hit) {
      const initial = engine.getSnapshot().selection;
      if (!additive) engine.select([]);
      gesture.current = {
        ...base,
        mode: "box",
        boxSelection: { initial, additive, intersect: !containMarquee },
      };
      marquee.show(point, point);
      return;
    }
    const ids = clickSelection(engine.getSnapshot().selection, hit.id, additive);
    engine.select(ids);
    if (picked?.locked) return;
    gesture.current = {
      ...base,
      ...captureTransformAuthoring(engine),
      mode: "move",
      clickTargetId: picked?.clickTargetId,
      layers: selectedRoots(currentPage, ids),
    };
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (wand.active()) {
      wand.move(event);
      return;
    }
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (!isTransformAuthoringCurrent(engine, active)) {
      cancelGesture();
      return;
    }
    if (!marqueeScope.prepareMarqueePage(engine, gesture, event, pagePoint))
      return cancelGesture(active.pointerId);
    const point = pagePoint(event);
    active.current = point;
    if (active.mode === "pan") {
      motion.jump(
        {
          ...active.view,
          x: active.view.x + event.clientX - active.client.x,
          y: active.view.y + event.clientY - active.client.y,
        },
        false,
      );
      return;
    }
    if (active.mode === "box") {
      if (
        active.boxStarted ||
        Math.hypot(event.clientX - active.client.x, event.clientY - active.client.y) > 3
      ) {
        active.boxStarted = true;
        marquee.show(active.from, point);
        liveMarquee.queue(active.from, point, active.boxSelection!);
      }
      return;
    }
    if (active.mode === "draw" && active.shape) {
      const shape = resizeDrawing(active.shape, active.from, point, event.shiftKey);
      active.shape = shape;
      controller.setGesture([], shape);
      return;
    }
    updateTransform(active, point, event.altKey, event.shiftKey);
  }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (wand.active()) {
      wand.finish();
      viewport.current?.releasePointerCapture(event.pointerId);
      return;
    }
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (!isTransformAuthoringCurrent(engine, active)) {
      cancelGesture();
      return;
    }
    if (!marqueeScope.prepareMarqueePage(engine, gesture, event, pagePoint))
      return cancelGesture(active.pointerId);
    if (active.mode === "move" || active.mode === "resize") {
      const finalPoint = readReleasePoint(active, event, () => pagePoint(event));
      if (
        finalPoint &&
        (finalPoint.x !== active.current.x ||
          finalPoint.y !== active.current.y ||
          (active.modifiers &&
            (active.modifiers.alt !== event.altKey || active.modifiers.shift !== event.shiftKey)))
      ) {
        active.current = finalPoint;
        updateTransform(active, finalPoint, event.altKey, event.shiftKey);
      }
    }
    if (active.mode === "box") {
      const box = active.boxSelection!;
      if (
        !box.secondary ||
        active.boxStarted ||
        Math.hypot(event.clientX - active.client.x, event.clientY - active.client.y) > 3
      )
        liveMarquee.queue(
          active.from,
          readReleasePoint(active, event, () => pagePoint(event)) ?? active.current,
          box,
        );
      liveMarquee.commit();
    }
    const commands = transformAuthoringCommands(engine, active, patchesRef.current);
    const distance = Math.hypot(event.clientX - active.client.x, event.clientY - active.client.y);
    cancelGesture(undefined, true);
    try {
      if (active.mode === "move" || active.mode === "resize") {
        if (distance > 1) engine.transaction(commands);
        else if (active.clickTargetId) engine.select([active.clickTargetId]);
      } else if (active.mode === "draw" && active.shape) {
        const shape = completeDrawing(active.shape, distance > 3, {
          from: active.from,
          to: pagePoint(event),
        });
        commitDrawing(engine, shape);
        if (!store.get(keepCreationToolAtom)) store.set(toolAtom, "pointer");
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      cancelGesture();
      viewport.current?.releasePointerCapture(event.pointerId);
    }
  }
  function pointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (!gesture.current || gesture.current.pointerId === event.pointerId) cancelGesture();
  }
  const gizmoProps = { engine, controller, viewSource: motion, onError };
  const transfers = useCanvasTransfers({
    engine,
    readPage: () => controller.read().page,
    readWorkspace: workspace.read,
    readView: motion.read,
    readViewport: () => viewport.current,
    onActive: setDragOver,
    onFiles: onDropFiles,
    onError,
    onLibraryDrop: () => store.set(toolAtom, "pointer"),
    allowOutsideActive: studio,
  });
  const cursor = tool === "hand" || space ? "grab" : tool === "pointer" ? "default" : "crosshair";
  return (
    <CanvasContextMenu engine={engine} resolveTarget={transfers.target} onError={onError}>
      <div
        className="editor-canvas"
        data-testid="editor-canvas"
        data-effect-input-surface
        data-canvas-tool={tool}
        data-navigation-held={space || undefined}
        aria-label={t("canvas")}
        ref={viewport}
        tabIndex={0}
        style={{ cursor }}
        onPointerDownCapture={() => motion.stop()}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerCancel}
        onLostPointerCapture={(event) => {
          if (gesture.current || wand.active()) pointerCancel(event);
        }}
        {...canvasNavigationKeys(setSpace)}
        onKeyDown={(event) => {
          if (!canvasNavigationKeyDown(event, setSpace)) return;
          const pendingBox = gesture.current?.boxSelection;
          const pixelSelection = Boolean(services?.pixelSelection?.read());
          if (pixelSelection || pendingBox?.secondary) {
            event.preventDefault();
            event.stopPropagation();
          }
          wand.escape();
          if (!pendingBox?.secondary) liveMarquee.discard();
          cancelGesture();
          if (!pixelSelection && !pendingBox?.secondary) engine.select([]);
        }}
        onDragOver={transfers.onDragOver}
        onDragLeave={transfers.onDragLeave}
        onDrop={transfers.onDrop}
      >
        <div className="canvas-stage">
          <InactiveArtboards
            engine={engine}
            workspace={layout}
            activeId={page.id}
            projectId={snapshot.project.id}
            view={shown}
            viewport={viewport}
            services={services}
          />
          <div
            className="canvas-artboard canvas-artboard-editor"
            data-testid="artboard"
            data-artboard-id={page.id}
            data-active="true"
            data-zoom={shown.zoom}
            data-pan-x={shown.x}
            data-pan-y={shown.y}
            data-view-moving={motion.isMoving()}
            style={artboardStyle(activeBoard, layout, shown)}
          >
            <EditorScene
              engine={engine}
              controller={controller}
              onError={onError}
              zoom={view.zoom}
              fontResolver={fontResolver}
              mediaResolverFor={services?.mediaResolverFor}
            />
            <CanvasSelection
              controller={controller}
              engine={engine}
              viewSource={pageViewSource}
              viewport={viewport}
              showHandles={tool === "pointer" || tool === "hand"}
              onHandle={handlePointerDown}
            />
            <Measurements
              controller={controller}
              snapping={snapFeedback}
              zoom={shown.zoom}
              viewSource={motion}
            />
            <EffectGizmo {...gizmoProps} />
          </div>
          <SelectionTools
            {...{ engine, services, tool, onError }}
            controller={controller}
            viewSource={pageViewSource}
            viewport={viewport}
          />
          <CanvasObjectEditing
            onError={onError}
            engine={engine}
            controller={controller}
            viewSource={pageViewSource}
            viewport={viewport}
            enabled={tool === "pointer" && !space}
          />
          <CanvasMarquee
            board={activeBoard}
            workspace={layout}
            view={shown}
            element={marqueeElement}
          />
          <ArtboardControls
            controller={controller}
            engine={engine}
            workspace={workspace}
            view={motion}
            viewport={viewport}
            onError={onError}
          />
        </div>
        <CanvasRulers
          controller={controller}
          engine={engine}
          page={page}
          view={pageView}
          viewSource={pageViewSource}
          viewport={viewport}
        />
        <ViewportControls engine={engine} view={shown} actions={viewportActions} />
        <PixelSelectionToolbar tool={tool} port={pixelSelection} onError={onError} />
        <QuickAdd
          engine={engine}
          viewport={viewport}
          workspace={workspace}
          viewSource={motion}
          controller={controller}
          onError={onError}
        />
        {tool !== "pointer" && <div className="canvas-help">{t("toolHint")}</div>}
        {dragOver && <div className="canvas-drag-overlay">{t("dropImages")}</div>}
      </div>
    </CanvasContextMenu>
  );
}
