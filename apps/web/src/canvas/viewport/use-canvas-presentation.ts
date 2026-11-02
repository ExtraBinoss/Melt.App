import { useEffect, useLayoutEffect, useMemo, type RefObject } from "react";
import type { Composition } from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import type { WorkspaceSource } from "../artboards/workspace";
import { paintArtboards } from "../artboards/presentation";
import type { ViewMotion } from "./motion";
import { selectionSizeLabel } from "../selection/size-label";
import { paintSelectionHandleInk } from "../selection/handle-color";
import { sourceGeometry } from "../selection/frame-geometry";
import { paintCanvasStyle } from "../shared/paint-style";

interface Options {
  controller: SceneController;
  workspace: WorkspaceSource;
  motion: ViewMotion;
  viewport: RefObject<HTMLDivElement | null>;
  beforePaint: () => void;
}
function createPresentation({ controller, workspace, motion, viewport, beforePaint }: Options) {
  let previousPage: Composition | null = null,
    previousZoom = 0,
    previousPlayback: boolean | undefined;
  return (forceGeometry = false) => {
    beforePaint();
    const frame = controller.read(),
      page = frame.page,
      view = motion.read(),
      root = viewport.current;
    if (!root) return;
    paintArtboards(root, workspace.read(), view);
    const artboard = root.querySelector<HTMLElement>('[data-testid="artboard"]');
    if (artboard) {
      const zoom = String(view.zoom),
        panX = String(view.x),
        panY = String(view.y);
      if (artboard.dataset.zoom !== zoom) artboard.dataset.zoom = zoom;
      if (artboard.dataset.panX !== panX) artboard.dataset.panX = panX;
      if (artboard.dataset.panY !== panY) artboard.dataset.panY = panY;
      const moving = String(motion.isMoving());
      if (artboard.dataset.viewMoving !== moving) artboard.dataset.viewMoving = moving;
    }
    const label = root.querySelector(".canvas-zoom");
    const zoomLabel = `${Math.round(view.zoom * 100)}%`;
    if (label && label.textContent !== zoomLabel) label.textContent = zoomLabel;
    if (
      !forceGeometry &&
      previousPage === page &&
      previousZoom === view.zoom &&
      previousPlayback === frame.playback
    )
      return;
    previousPage = page;
    previousZoom = view.zoom;
    previousPlayback = frame.playback;
    const index = sourceGeometry(controller);
    for (const overlay of root.querySelectorAll<HTMLElement>(".canvas-selection[data-layer-id]")) {
      const layer = index.byId.get(overlay.dataset.layerId!);
      const visible = layer && index.isVisible(layer.id) && !layer.maskSource;
      const display = visible ? "" : "none",
        opacity = frame.playback ? "0.2" : "1",
        inert = Boolean(frame.playback || !visible || (layer && index.isLocked(layer.id)));
      // Inert changes can inspect focus/layout; do them before this surface’s style writes.
      if (overlay.inert !== inert) overlay.inert = inert;
      paintCanvasStyle(overlay, { display, opacity });
      if (!layer) continue;
      paintSelectionHandleInk(overlay, layer, page);
      const world = index.worldMatrix(layer.id);
      paintCanvasStyle(overlay, {
        width: `${layer.width}px`,
        height: `${layer.height}px`,
        borderWidth: `${1 / view.zoom}px`,
        transform: `matrix(${world.join(",")})`,
      });
      const size = overlay.querySelector<HTMLElement>(".canvas-selection-size");
      if (size) {
        const label = `${Math.round(layer.width)} × ${Math.round(layer.height)}`;
        if (size.textContent !== label) size.textContent = label;
        paintCanvasStyle(size, {
          ...selectionSizeLabel(layer, world, view.zoom),
          transformOrigin: "0px 0px",
        });
      }
      for (const handle of overlay.querySelectorAll<HTMLButtonElement>(".canvas-handle")) {
        const transform = `scale(${1 / view.zoom})`;
        paintCanvasStyle(handle, { transform });
        if (handle.disabled !== inert) handle.disabled = inert;
      }
      const lock = overlay.querySelector<HTMLElement>(".canvas-layer-lock");
      const transform = `translate(-50%, -50%) scale(${1 / view.zoom})`;
      if (lock) paintCanvasStyle(lock, { transform });
    }
  };
}
/** Pan updates compositor transforms only; geometry DOM is touched when its scene or zoom changes. */
export function useCanvasPresentation({
  controller,
  workspace,
  motion,
  viewport,
  beforePaint,
}: Options) {
  const paint = useMemo(
    () => createPresentation({ controller, workspace, motion, viewport, beforePaint }),
    [controller, workspace, motion, viewport, beforePaint],
  );
  useLayoutEffect(() => paint(true));
  useEffect(() => {
    const update = () => paint();
    const stopScene = controller.subscribe(update),
      stopView = motion.subscribe(update);
    return () => {
      stopScene();
      stopView();
    };
  }, [controller, motion, paint]);
}
