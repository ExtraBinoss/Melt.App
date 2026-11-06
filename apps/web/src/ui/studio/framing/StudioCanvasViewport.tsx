import { useEffect, useLayoutEffect, useRef } from "react";
import { fitOutputRegion } from "@musart/core";
import { useProjectPreference } from "../../../components/workspace/preferences/context";
import { useWorkspaceMode } from "../workspace-mode";
import type { SpatialCanvasProps } from "../../../canvas/spatial/CanvasSpatialEditing";
import { getStudioViewport } from "./viewport";
import { DEFAULT_STUDIO_GUIDES, STUDIO_GUIDE_COLORS, studioSafeInsets } from "./guide-settings";
import "../../../components/ui/blur-text-animation.css";
import "../../../components/shared/motion/palette-panel.css";
import "./backdrop.css";
import "./framing.css";

/** One imperative projection: camera input paints only the guide, never the editor React tree. */
export function StudioCanvasViewport({
  engine,
  controller,
  viewSource,
  viewport,
}: SpatialCanvasProps) {
  const active = useWorkspaceMode() === "studio";
  const capture = useProjectPreference("studioCapture");
  const window = useRef<HTMLDivElement>(null);
  const matte = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const safe = useRef<HTMLDivElement>(null);
  const center = useRef<HTMLDivElement>(null);
  const config = useRef(capture);
  const paint = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    config.current = capture;
    paint.current?.();
  }, [capture]);
  useEffect(() => {
    if (!active || !viewport.current) return;
    const element = viewport.current,
      port = getStudioViewport(engine);
    let size = { width: element.clientWidth, height: element.clientHeight };
    const update = () => {
      const snapshot = engine.getSnapshot(),
        frame = controller.read(),
        view = viewSource.read();
      if (size.width <= 0 || size.height <= 0 || view.zoom <= 0) return;
      const width = Math.min(frame.page.width, size.width / view.zoom),
        height = Math.min(frame.page.height, size.height / view.zoom);
      const region = {
        x: Math.max(
          0,
          Math.min(
            frame.page.width - width,
            frame.page.width / 2 - (size.width / 2 + view.x) / view.zoom,
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            frame.page.height - height,
            frame.page.height / 2 - (size.height / 2 + view.y) / view.zoom,
          ),
        ),
        width,
        height,
      };
      port.publish({
        projectId: snapshot.project.id,
        pageId: frame.page.id,
        region,
        displayRegion: {
          x: frame.page.width / 2 - (size.width / 2 + view.x) / view.zoom,
          y: frame.page.height / 2 - (size.height / 2 + view.y) / view.zoom,
          width: size.width / view.zoom,
          height: size.height / view.zoom,
        },
        width: Math.round(width),
        height: Math.round(height),
      });
      const choice = frame.page.captureGuides ?? config.current;
      const guides = frame.page.captureGuides ?? DEFAULT_STUDIO_GUIDES;
      const target =
        choice && !choice.full ? fitOutputRegion(region, choice.width, choice.height) : region;
      const guide = window.current,
        shade = matte.current;
      if (!guide || !shade) return;
      guide.hidden = !choice?.visible;
      shade.hidden = guide.hidden;
      if (guide.hidden) return;
      const left = size.width / 2 + view.x + (target.x - frame.page.width / 2) * view.zoom;
      const top = size.height / 2 + view.y + (target.y - frame.page.height / 2) * view.zoom;
      const right = left + target.width * view.zoom,
        bottom = top + target.height * view.zoom;
      // Four non-overlapping bands need neither a giant shadow nor a rasterized clip mask.
      shade.style.setProperty("--capture-left", `${Math.max(0, Math.min(size.width, left))}px`);
      shade.style.setProperty("--capture-right", `${Math.max(0, Math.min(size.width, right))}px`);
      shade.style.setProperty("--capture-top", `${Math.max(0, Math.min(size.height, top))}px`);
      shade.style.setProperty(
        "--capture-bottom",
        `${Math.max(0, Math.min(size.height, bottom))}px`,
      );
      guide.style.left = `${left}px`;
      guide.style.top = `${top}px`;
      guide.style.width = `${target.width * view.zoom}px`;
      guide.style.height = `${target.height * view.zoom}px`;
      guide.style.setProperty("--studio-guide-color", STUDIO_GUIDE_COLORS[guides.color]);
      const insets = studioSafeInsets(choice, guides);
      if (safe.current) {
        safe.current.hidden = !insets;
        if (insets) {
          safe.current.style.top = `${insets.top * 100}%`;
          safe.current.style.right = `${insets.right * 100}%`;
          safe.current.style.bottom = `${insets.bottom * 100}%`;
          safe.current.style.left = `${insets.left * 100}%`;
        }
      }
      if (center.current) center.current.hidden = !guides.center;
      if (label.current)
        label.current.textContent = `${choice?.full ? Math.round(width) : choice?.width} × ${choice?.full ? Math.round(height) : choice?.height}`;
    };
    paint.current = update;
    const stopView = viewSource.subscribe(update),
      stopScene = controller.subscribe(update);
    const resize = new ResizeObserver(([entry]) => {
      if (entry) size = { width: entry.contentRect.width, height: entry.contentRect.height };
      update();
    });
    resize.observe(element);
    update();
    return () => {
      paint.current = null;
      stopView();
      stopScene();
      resize.disconnect();
      port.publish(null);
    };
  }, [active, engine, controller, viewSource, viewport]);
  return active ? (
    <>
      <div className="studio-capture-overlay" aria-hidden="true">
        <div
          ref={matte}
          className="studio-capture-matte"
          hidden={!capture?.visible}
          data-studio-capture-matte
        >
          <i />
          <i />
          <i />
          <i />
        </div>
        <div
          ref={window}
          className="studio-capture-window"
          hidden={!capture?.visible}
          data-studio-capture
        >
          <span ref={label} />
          <div ref={safe} className="studio-safe-area" data-studio-safe-area />
          <div ref={center} className="studio-guide-center" hidden>
            <i />
            <i />
          </div>
        </div>
      </div>
    </>
  ) : null;
}
