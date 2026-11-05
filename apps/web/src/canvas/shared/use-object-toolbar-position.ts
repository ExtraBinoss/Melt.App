import { useLayoutEffect, type RefObject } from "react";
import { createLayerGeometryIndex, transformPoint } from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import { observeSelectionPresentation, resolveSelectionFrame } from "../selection/selection-frame";
import { rotationHandlePoint } from "../selection/rotation-handle";

/** Toolbars and selection grips share the prepared native ink, including the
 * same screen-sized rotation grip. Font preparation repaints this leaf only.
 */
export function useObjectToolbarPosition(
  anchor: RefObject<HTMLDivElement | null>,
  controller: SceneController,
  view: ViewSource,
  viewport: RefObject<HTMLDivElement | null>,
  layerId: string,
  allowDraft: boolean,
) {
  useLayoutEffect(() => {
    const root = anchor.current,
      element = viewport.current ?? root?.closest<HTMLDivElement>(".editor-canvas");
    if (!root || !element) return;
    const coarse = window.matchMedia("(pointer: coarse)");
    let size = { width: element.clientWidth, height: element.clientHeight },
      button = { width: root.offsetWidth, height: root.offsetHeight };
    function paint() {
      const frame = controller.read();
      if (frame.playback || (!allowDraft && frame.presentation?.canonical === false)) {
        root!.dataset.hidden = "true";
        return;
      }
      const geometry = createLayerGeometryIndex(frame.page),
        layer = geometry.byId.get(layerId);
      root!.dataset.hidden = String(!layer);
      if (!layer) return;
      const pose = view.read(),
        scale = coarse.matches ? 1 : Math.max(0.6, Math.min(0.85, Math.sqrt(pose.zoom) * 0.85)),
        width = button.width * scale,
        height = button.height * scale,
        selection = resolveSelectionFrame(
          frame.page,
          geometry,
          layer,
          element!.querySelector("canvas"),
        ),
        corners = [
          { x: 0, y: 0 },
          { x: selection.width, y: 0 },
          { x: selection.width, y: selection.height },
          { x: 0, y: selection.height },
        ].map((point) => transformPoint(selection.matrix, point)),
        left = Math.min(...corners.map((point) => point.x)),
        right = Math.max(...corners.map((point) => point.x)),
        top = Math.min(...corners.map((point) => point.y)),
        bottom = Math.max(...corners.map((point) => point.y)),
        grip = rotationHandlePoint(selection.width, selection.matrix, pose.zoom);
      const screen = (x: number, y: number) => ({
        x: size.width / 2 + pose.x + (x - frame.page.width / 2) * pose.zoom,
        y: size.height / 2 + pose.y + (y - frame.page.height / 2) * pose.zoom,
      });
      const above = Math.min(screen(0, top).y, screen(grip.x, grip.y).y - 6) - 8 * scale;
      const y = above >= height + 12 ? above : screen(0, bottom).y + 30 + height;
      const x = Math.max(
        width / 2 + 12,
        Math.min(size.width - width / 2 - 12, screen((left + right) / 2, 0).x),
      );
      root!.style.transform = `translate3d(${x}px,${Math.max(Math.min(height + 12, size.height - 8), Math.min(size.height - 8, y))}px,0) translate(-50%,-100%) scale(${scale})`;
    }
    paint();
    coarse.addEventListener("change", paint);
    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === element)
          size = { width: entry.contentRect.width, height: entry.contentRect.height };
        else button = { width: root!.offsetWidth, height: root!.offsetHeight };
      }
      paint();
    });
    resize.observe(element);
    resize.observe(root);
    const stops = [
      controller.subscribe(paint),
      view.subscribe(paint),
      observeSelectionPresentation(element, paint),
    ];
    return () => {
      resize.disconnect();
      coarse.removeEventListener("change", paint);
      for (const stop of stops) stop();
    };
  }, [anchor, controller, view, viewport, layerId, allowDraft]);
}
