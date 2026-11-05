import { useAtomValue } from "jotai";
import { useWorkspaceMode } from "../../ui/studio/workspace-mode";
import { spatialEditingAtom } from "../../state/session/spatial-editing";
import { vectorEditingAtom } from "../../state/session/vector-editing";
import { memo, useLayoutEffect, useMemo, useRef, type PointerEvent, type RefObject } from "react";
import { createLayerGeometryIndex, type EnginePort } from "@musart/core";
import { useEngineValue } from "../../state/session/editor";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import { GuideOverlay } from "../guides/GuideOverlay";
import { SelectionOverlays } from "./SelectionOverlays";
import { SelectionPlane } from "./SelectionPlane";
import { createTimelineHoverSource } from "../../state/motion/hover";
import { sourceGeometry } from "./frame-geometry";
import { paintSelectionHandleInk } from "./handle-color";

/** Only selection decorations subscribe to selected IDs; the retained canvas stays untouched. */
export const CanvasSelection = memo(function CanvasSelection({
  engine,
  controller,
  viewSource,
  viewport,
  showHandles,
  onHandle,
}: {
  engine: EnginePort;
  controller: SceneController;
  viewSource: ViewSource;
  viewport: RefObject<HTMLDivElement | null>;
  showHandles: boolean;
  onHandle: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const studio = useWorkspaceMode() === "studio";
  const editing = useAtomValue(vectorEditingAtom(engine));
  const spatialEditing = useAtomValue(spatialEditingAtom(engine));
  const page = useEngineValue(
    engine,
    (snapshot) =>
      snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
      snapshot.project.pages[0]!,
  );
  const selection = useEngineValue(engine, (snapshot) => snapshot.selection);
  const view = viewSource.read();
  const selected = useMemo(() => {
    // Keep evaluated-visible frames even when their base visibility is off.
    return createLayerGeometryIndex(page).orderedLayers(selection);
  }, [page, selection]);
  return (
    <>
      <GuideOverlay
        controller={controller}
        engine={engine}
        page={page}
        selected={selection}
        view={view}
        viewSource={viewSource}
        viewport={viewport}
      />
      <SelectionPlane controller={controller} viewSource={viewSource}>
        {showHandles &&
          !spatialEditing &&
          !(
            selected.length === 1 &&
            editing?.layerId === selected[0]!.id &&
            editing.pageId === page.id &&
            editing.projectId === engine.getSnapshot().project.id
          ) && (
            <SelectionOverlays
              page={page}
              selected={studio ? selected.filter((layer) => !layer.spatial?.enabled) : selected}
              zoom={view.zoom}
              controller={controller}
              viewSource={viewSource}
              onHandle={onHandle}
            />
          )}
        <TimelineHoverOutline
          engine={engine}
          controller={controller}
          viewSource={viewSource}
          studio={studio}
        />
      </SelectionPlane>
    </>
  );
});

/** One retained, noninteractive frame follows evaluated artwork without subscribing React to hover. */
function TimelineHoverOutline({
  engine,
  controller,
  viewSource,
  studio,
}: {
  engine: EnginePort;
  controller: SceneController;
  viewSource: ViewSource;
  studio: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const hover = useMemo(() => createTimelineHoverSource(engine), [engine]);
  useLayoutEffect(() => {
    let previousPage: unknown = null,
      previousTarget: unknown = null,
      previousZoom = 0,
      previousPlayback: boolean | undefined,
      previousSelection: readonly string[] | null = null;
    let selected = new Set<string>();
    const handles =
      element.current?.querySelectorAll<HTMLElement>(".canvas-timeline-hover-handle") ?? [];
    const paint = () => {
      const node = element.current,
        target = hover.read(),
        frame = controller.read(),
        scale = viewSource.read().zoom,
        snapshot = engine.getSnapshot(),
        selection = snapshot.selection;
      if (
        !node ||
        (previousPage === frame.page &&
          previousTarget === target &&
          previousZoom === scale &&
          previousPlayback === frame.playback &&
          previousSelection === selection)
      )
        return;
      previousPage = frame.page;
      previousTarget = target;
      previousZoom = scale;
      previousPlayback = frame.playback;
      if (previousSelection !== selection) {
        previousSelection = selection;
        selected = new Set(selection);
      }
      if (
        !target ||
        target.projectId !== snapshot.project.id ||
        target.compositionId !== frame.page.id ||
        selected.has(target.layerId)
      ) {
        if (node.style.display !== "none") node.style.display = "none";
        delete node.dataset.layerId;
        return;
      }
      const index = sourceGeometry(controller);
      const layer = index.byId.get(target.layerId);
      const visible =
        layer &&
        !(studio && layer.spatial?.enabled) &&
        index.isVisible(layer.id) &&
        !index.isMaskSource(layer.id);
      node.style.display = visible ? "" : "none";
      if (!visible || !layer) {
        delete node.dataset.layerId;
        return;
      }
      node.dataset.layerId = layer.id;
      node.dataset.layerKind = layer.kind;
      node.dataset.playback = String(Boolean(frame.playback));
      paintSelectionHandleInk(node, layer, frame.page);
      const bounds = layer.spatial?.enabled ? index.worldBounds(layer.id) : null;
      const matrix = bounds ? [1, 0, 0, 1, bounds.x, bounds.y] : index.worldMatrix(layer.id);
      Object.assign(node.style, {
        width: `${bounds?.width ?? layer.width}px`,
        height: `${bounds?.height ?? layer.height}px`,
        borderWidth: `${1 / scale}px`,
        transform: `matrix(${matrix.join(",")})`,
        opacity: frame.playback ? ".2" : "1",
      });
      for (const handle of handles) handle.style.transform = `scale(${1 / scale})`;
    };
    paint();
    const stopHover = hover.subscribe(paint),
      stopScene = controller.subscribe(paint),
      stopView = viewSource.subscribe(paint),
      stopSelection = engine.subscribe(paint);
    return () => {
      stopHover();
      stopScene();
      stopView();
      stopSelection();
    };
  }, [controller, engine, hover, viewSource, studio]);
  return (
    <div
      ref={element}
      className="canvas-timeline-hover"
      aria-hidden="true"
      style={{ display: "none" }}
    >
      {(["nw", "ne", "sw", "se"] as const).map((corner) => (
        <span key={corner} className={`canvas-timeline-hover-handle is-${corner}`} />
      ))}
    </div>
  );
}
