import { useLayoutEffect, useRef, type RefObject, type PointerEvent } from "react";
import { createLayerGeometryIndex, type EnginePort } from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import type { ObjectSelectionPort } from "../../services/selection/object/model";
import { formatUiError } from "../../state/i18n/errors/format";
import "./object-selection.css";
const ns = "http://www.w3.org/2000/svg";
interface Drag {
  pointer: number;
  group: SVGGElement;
  layerId: string;
  start: { x: number; y: number };
  client: { x: number; y: number };
  foreground: boolean;
  project: object;
  pageId: string;
  pose: object | undefined;
}
export function ObjectSelectionSurface({
  port,
  engine,
  controller,
  viewSource,
  viewport,
  enabled,
  onError,
}: {
  port?: ObjectSelectionPort;
  engine: EnginePort;
  controller: SceneController;
  viewSource: ViewSource;
  viewport: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  onError?: (message: string) => void;
}) {
  const root = useRef<SVGSVGElement>(null),
    drag = useRef<Drag | null>(null),
    pan = useRef(false),
    hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => {
    const svg = root.current;
    if (!svg || !port || !enabled) return;
    function paint() {
      const frame = controller.read(),
        view = viewSource.read(),
        index = createLayerGeometryIndex(frame.page),
        snapshot = engine.getSnapshot(),
        state = port!.read(),
        width = viewport.current?.clientWidth ?? 1,
        height = viewport.current?.clientHeight ?? 1;
      svg!.style.display = frame.playback ? "none" : "";
      svg!.setAttribute("viewBox", `0 0 ${width} ${height}`);
      const layers = [...index.byId.values()].filter(
        (layer) =>
          layer.kind === "image" &&
          !layer.spatial &&
          index.isVisible(layer.id) &&
          !index.isLocked(layer.id) &&
          (snapshot.selection.length === 0 ||
            (snapshot.selection.length === 1 && layer.id === snapshot.selection[0])),
      );
      const selected = layers.find((layer) => layer.id === snapshot.selection[0]);
      if (selected) {
        layers.splice(layers.indexOf(selected), 1);
        layers.push(selected);
      }
      const live = new Set(layers.map((layer) => layer.id));
      for (const group of Array.from(svg!.children))
        if (!live.has(group.getAttribute("data-layer-id") ?? "")) group.remove();
      for (const layer of layers) {
        let group = Array.from(svg!.children).find(
          (node) => node.getAttribute("data-layer-id") === layer.id,
        ) as SVGGElement | undefined;
        if (!group) {
          group = document.createElementNS(ns, "g");
          group.dataset.layerId = layer.id;
          const hit = document.createElementNS(ns, "rect");
          hit.classList.add("object-selection-hit");
          const box = document.createElementNS(ns, "rect");
          box.classList.add("object-selection-box");
          box.setAttribute("vector-effect", "non-scaling-stroke");
          box.style.display = "none";
          const marks = document.createElementNS(ns, "g");
          marks.classList.add("object-selection-points");
          group.append(hit, box, marks);
          svg!.append(group);
        }
        const transform = `translate(${width / 2 + view.x - (frame.page.width * view.zoom) / 2} ${height / 2 + view.y - (frame.page.height * view.zoom) / 2}) scale(${view.zoom}) matrix(${index.worldMatrix(layer.id).join(",")})`;
        group.setAttribute("transform", transform);
        const hit = group.querySelector(".object-selection-hit")!;
        hit.setAttribute("width", String(layer.width));
        hit.setAttribute("height", String(layer.height));
        hit.setAttribute("pointer-events", pan.current ? "none" : "all");
        const marks = group.querySelector(".object-selection-points")!;
        marks.replaceChildren();
        if (state?.layerId === layer.id && !state.automatic)
          for (const point of state.points) {
            const circle = document.createElementNS(ns, "circle");
            circle.setAttribute("cx", String((point.x * layer.width) / state.width));
            circle.setAttribute("cy", String((point.y * layer.height) / state.height));
            circle.setAttribute("r", String(4 / view.zoom));
            circle.setAttribute("vector-effect", "non-scaling-stroke");
            circle.setAttribute(
              "class",
              point.label ? "object-point-positive" : "object-point-negative",
            );
            marks.append(circle);
          }
        const box = group.querySelector<SVGRectElement>(".object-selection-box")!;
        if (!drag.current) {
          const bounds = state?.layerId === layer.id ? state.box : undefined;
          box.style.display = bounds ? "" : "none";
          if (bounds) {
            box.setAttribute("x", String((bounds.x * layer.width) / state!.width));
            box.setAttribute("y", String((bounds.y * layer.height) / state!.height));
            box.setAttribute(
              "width",
              String(((bounds.right - bounds.x) * layer.width) / state!.width),
            );
            box.setAttribute(
              "height",
              String(((bounds.bottom - bounds.y) * layer.height) / state!.height),
            );
          }
        }
        // Keep the selected image above other hit regions without changing the document.
        svg!.append(group);
      }
    }
    function keyboard(event: KeyboardEvent) {
      if (event.code === "Space") {
        pan.current = event.type === "keydown";
        paint();
      }
      if (event.key === "Escape") {
        drag.current = null;
        paint();
      }
    }
    function blur() {
      pan.current = false;
      drag.current = null;
      paint();
    }
    const resize = new ResizeObserver(paint);
    if (viewport.current) resize.observe(viewport.current);
    const stops = [
      port.subscribe(paint),
      controller.subscribe(paint),
      viewSource.subscribe(paint),
      engine.subscribe(paint),
    ];
    window.addEventListener("keydown", keyboard);
    window.addEventListener("keyup", keyboard);
    window.addEventListener("blur", blur);
    paint();
    return () => {
      clearTimeout(hoverTimer.current);
      drag.current = null;
      pan.current = false;
      for (const stop of stops) stop();
      resize.disconnect();
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("keyup", keyboard);
      window.removeEventListener("blur", blur);
      svg.replaceChildren();
      port.release();
    };
  }, [port, engine, controller, viewSource, viewport, enabled]);
  function local(event: { clientX: number; clientY: number }, group: SVGGElement) {
    const matrix = group.getScreenCTM();
    if (!matrix) throw Error("Object selection geometry is unavailable.");
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  }
  function report(task: Promise<void>) {
    void task.catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        onError?.(formatUiError(error));
    });
  }
  function finish(event: PointerEvent<SVGSVGElement>, cancel = false) {
    const held = drag.current;
    if (!held || held.pointer !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    if (root.current?.hasPointerCapture(event.pointerId))
      root.current.releasePointerCapture(event.pointerId);
    const snapshot = engine.getSnapshot();
    if (
      cancel ||
      snapshot.project !== held.project ||
      snapshot.pageId !== held.pageId ||
      controller.read().playback ||
      controller.read().motionFrame !== held.pose
    ) {
      held.group.querySelector<SVGRectElement>(".object-selection-box")!.style.display = "none";
      return;
    }
    const end = local(event, held.group),
      page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!,
      layer = createLayerGeometryIndex(page).byId.get(held.layerId),
      hit = held.group.querySelector<SVGRectElement>(".object-selection-hit")!,
      sx = (layer?.width ?? 1) / Number(hit.getAttribute("width")),
      sy = (layer?.height ?? 1) / Number(hit.getAttribute("height")),
      moved = Math.hypot(event.clientX - held.client.x, event.clientY - held.client.y);
    if (held.foreground && moved > 4) {
      if (moved > 4)
        report(
          port!.box(held.layerId, {
            x: held.start.x * sx,
            y: held.start.y * sy,
            right: end.x * sx,
            bottom: end.y * sy,
          }),
        );
    } else report(port!.point(held.layerId, end.x * sx, end.y * sy, held.foreground));
  }
  return (
    <svg
      ref={root}
      className="object-selection-surface"
      data-testid="object-selection-surface"
      aria-hidden="true"
      style={{ display: enabled ? undefined : "none", pointerEvents: enabled ? "auto" : "none" }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        clearTimeout(hoverTimer.current);
        if (!port || !enabled || pan.current || (event.button !== 0 && event.button !== 2)) return;
        event.preventDefault();
        event.stopPropagation();
        const group = (event.target as Element).closest<SVGGElement>("g[data-layer-id]");
        if (!group || drag.current) return;
        viewport.current?.focus({ preventScroll: true });
        const snapshot = engine.getSnapshot();
        drag.current = {
          pointer: event.pointerId,
          group,
          layerId: group.dataset.layerId!,
          start: local(event, group),
          client: { x: event.clientX, y: event.clientY },
          foreground: event.button === 0 && !event.altKey,
          project: snapshot.project,
          pageId: snapshot.pageId,
          pose: controller.read().motionFrame,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const held = drag.current;
        if (!held) {
          clearTimeout(hoverTimer.current);
          const group = (event.target as Element).closest<SVGGElement>("g[data-layer-id]");
          if (!port || !enabled || pan.current || !group || controller.read().playback) return;
          const point = local(event, group),
            layerId = group.dataset.layerId!;
          hoverTimer.current = setTimeout(() => report(port.hover(layerId, point.x, point.y)), 250);
          return;
        }
        if (held.pointer !== event.pointerId || !held.foreground) return;
        event.stopPropagation();
        const end = local(event, held.group),
          box = held.group.querySelector<SVGRectElement>(".object-selection-box")!;
        box.style.display = "";
        box.setAttribute("x", String(Math.min(end.x, held.start.x)));
        box.setAttribute("y", String(Math.min(end.y, held.start.y)));
        box.setAttribute("width", String(Math.abs(end.x - held.start.x)));
        box.setAttribute("height", String(Math.abs(end.y - held.start.y)));
      }}
      onPointerLeave={() => {
        clearTimeout(hoverTimer.current);
        if (!drag.current) port?.clearHover();
      }}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
    />
  );
}
