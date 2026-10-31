import { useLayoutEffect, useRef, type RefObject } from "react";
import { motion, useIsPresent, useReducedMotion } from "motion/react";
import { createLayerGeometryIndex, transformPoint } from "@musart/core";
import { Spline } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
export function VectorEditEntry({
  controller,
  view,
  viewport,
  layerId,
  onEdit,
}: {
  controller: SceneController;
  view: ViewSource;
  viewport: RefObject<HTMLDivElement | null>;
  layerId: string;
  onEdit: () => void;
}) {
  const anchor = useRef<HTMLDivElement>(null),
    present = useIsPresent(),
    reduced = useReducedMotion(),
    { t } = useTranslation("vectorEditor");
  useLayoutEffect(() => {
    const root = anchor.current,
      element = viewport.current ?? root?.closest<HTMLDivElement>(".editor-canvas");
    if (!root || !element) return;
    const coarse = window.matchMedia("(pointer: coarse)");
    let size = { width: element.clientWidth, height: element.clientHeight },
      button = { width: root.offsetWidth, height: root.offsetHeight };
    function paint() {
      const frame = controller.read();
      if (frame.playback || frame.presentation?.canonical === false) {
        root!.dataset.hidden = "true";
        return;
      }
      const geometry = createLayerGeometryIndex(frame.page),
        layer = geometry.byId.get(layerId);
      const hidden = !layer;
      root!.dataset.hidden = String(hidden);
      if (hidden || !layer) return;
      const pose = view.read(),
        scale = coarse.matches ? 1 : Math.max(0.6, Math.min(0.85, Math.sqrt(pose.zoom) * 0.85)),
        width = button.width * scale,
        height = button.height * scale,
        bounds = geometry.worldBounds(layerId),
        matrix = geometry.worldMatrix(layerId),
        grip = transformPoint(matrix, { x: layer.width / 2, y: -19 });
      const screen = (x: number, y: number) => ({
        x: size.width / 2 + pose.x + (x - frame.page.width / 2) * pose.zoom,
        y: size.height / 2 + pose.y + (y - frame.page.height / 2) * pose.zoom,
      });
      const top = screen(bounds.x + bounds.width / 2, bounds.y),
        bottom = screen(bounds.x + bounds.width / 2, bounds.y + bounds.height),
        rotate = screen(grip.x, grip.y);
      const above = Math.min(top.y, rotate.y - 6) - 8 * scale;
      const y = above >= height + 12 ? above : bottom.y + 30 + height;
      const x = Math.max(width / 2 + 12, Math.min(size.width - width / 2 - 12, top.x));
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
    const stops = [controller.subscribe(paint), view.subscribe(paint)];
    return () => {
      resize.disconnect();
      coarse.removeEventListener("change", paint);
      for (const stop of stops) stop();
    };
  }, [controller, view, viewport, layerId]);
  return (
    <div
      ref={anchor}
      className="vector-edit-entry-anchor"
      data-canvas-control
      inert={!present}
      aria-hidden={!present}
    >
      <motion.aside
        className="vector-canvas-toolbar vector-canvas-entry floating-panel"
        initial={reduced ? false : { opacity: 0, scale: 0.88, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 4 }}
        transition={{ duration: reduced ? 0 : 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <Button size="sm" onClick={onEdit}>
          <Spline size={13} />
          {t("edit")}
        </Button>
      </motion.aside>
    </div>
  );
}
