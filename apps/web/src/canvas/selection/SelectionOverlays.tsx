import { useLayoutEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { type Composition, type Layer } from "@musart/core";
import { LockKeyhole } from "lucide-react";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import "./selection-presentation.css";
import "../../components/layers/messages";
import { SelectionEdges } from "./SelectionEdges";
import { selectionSizeLabel } from "./size-label";
import { sourceGeometry } from "./frame-geometry";
import { selectionHandleInk } from "./handle-color";
import { paintCanvasStyle } from "../shared/paint-style";
import { rotationHandlePlacement } from "./rotation-handle";

interface Props {
  page: Composition;
  selected: Layer[];
  zoom: number;
  controller: SceneController;
  viewSource: ViewSource;
  onHandle: (event: PointerEvent<HTMLButtonElement>) => void;
}
const MAX_INDIVIDUAL_FRAMES = 64;
function CollectiveFrame({
  selected,
  controller,
  viewSource,
  zoom,
}: Omit<Props, "page" | "onHandle">) {
  const frame = useRef<HTMLDivElement>(null),
    { t } = useTranslation();
  useLayoutEffect(() => {
    let previous: Composition | null = null,
      previousZoom = 0,
      previousPlayback: boolean | undefined;
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    const paint = () => {
      const current = controller.read(),
        scale = viewSource.read().zoom;
      if (
        previous === current.page &&
        previousZoom === scale &&
        previousPlayback === current.playback
      )
        return;
      const element = frame.current;
      if (!element) return;
      if (previous !== current.page) {
        const index = sourceGeometry(controller);
        const bounds = index.collectiveBounds(
          selected
            .filter(
              (layer) =>
                index.byId.has(layer.id) &&
                index.isVisible(layer.id) &&
                !index.get(layer.id).maskSource,
            )
            .map((layer) => layer.id),
        );
        left = bounds?.x ?? Infinity;
        top = bounds?.y ?? Infinity;
        right = bounds ? bounds.x + bounds.width : -Infinity;
        bottom = bounds ? bounds.y + bounds.height : -Infinity;
      }
      previous = current.page;
      previousZoom = scale;
      previousPlayback = current.playback;
      const display = !Number.isFinite(left) ? "none" : "",
        opacity = current.playback ? "0.2" : "1";
      paintCanvasStyle(element, { display, opacity });
      if (!Number.isFinite(left)) return;
      paintCanvasStyle(element, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${right - left}px`,
        height: `${bottom - top}px`,
        borderWidth: `${1 / scale}px`,
      });
      const label = element.querySelector<HTMLElement>(".canvas-selection-size");
      const transform = `translateX(-50%) scale(${1 / scale})`;
      if (label) paintCanvasStyle(label, { transform });
    };
    paint();
    const stopScene = controller.subscribe(paint),
      stopView = viewSource.subscribe(paint);
    return () => {
      stopScene();
      stopView();
    };
  }, [selected, controller, viewSource]);
  return (
    <div
      ref={frame}
      className="canvas-selection canvas-selection-collective"
      data-selection-count={selected.length}
      aria-label={t("selectedCount", { count: selected.length })}
    >
      <span
        className="canvas-selection-size"
        style={{ transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: "top center" }}
      >
        {t("selectedCount", { count: selected.length })}
      </span>
    </div>
  );
}

export function SelectionOverlays({
  page,
  selected,
  zoom,
  controller,
  viewSource,
  onHandle,
}: Props) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    let previous: boolean | undefined,
      previousZoom = 0;
    const paint = () => {
      const node = root.current,
        playback = Boolean(controller.read().playback);
      if (!node) return;
      const scale = viewSource.read().zoom;
      if (previousZoom !== scale) {
        const hit = `${8 / scale}px`;
        if (node.style.getPropertyValue("--canvas-edge-hit") !== hit)
          node.style.setProperty("--canvas-edge-hit", hit);
        previousZoom = scale;
      }
      if (previous === playback) return;
      previous = playback;
      const state = String(playback);
      if (node.dataset.playback !== state) node.dataset.playback = state;
      if (node.inert !== playback) node.inert = playback;
      for (const overlay of node.querySelectorAll<HTMLElement>(".canvas-selection")) {
        const blocked =
          playback ||
          overlay.inert ||
          overlay.dataset.locked === "true" ||
          overlay.style.display === "none";
        for (const handle of overlay.querySelectorAll<HTMLButtonElement>(
          ".canvas-handle, .canvas-resize-edge",
        ))
          if (handle.disabled !== blocked) handle.disabled = blocked;
      }
    };
    paint();
    const stopScene = controller.subscribe(paint),
      stopView = viewSource.subscribe(paint);
    return () => {
      stopScene();
      stopView();
    };
  }, [controller, viewSource, selected]);
  // Selection-only publications retain the scene identity: mount directly on its current pose.
  const presented = controller.read().page;
  const index = sourceGeometry(controller);
  return (
    <div
      ref={root}
      className="canvas-selection-overlays"
      data-selection-size={selected.length}
      data-selection-count={selected.length}
    >
      {selected.length > MAX_INDIVIDUAL_FRAMES ? (
        <CollectiveFrame
          selected={selected}
          zoom={zoom}
          controller={controller}
          viewSource={viewSource}
        />
      ) : (
        selected.map((selectedLayer) => {
          const layer = index.byId.get(selectedLayer.id);
          if (!layer || presented.id !== page.id) return null;
          const locked = selectedLayer.locked || index.isLocked(layer.id);
          const ink = selectionHandleInk(layer, presented);
          return (
            <div
              key={layer.id}
              className="canvas-selection"
              data-layer-id={layer.id}
              data-layer-kind={layer.kind}
              data-locked={locked || undefined}
              style={
                {
                  "--canvas-handle-color": ink,
                  "--canvas-handle-outline": ink === "#ffffff" ? "#000000" : "#ffffff",
                  display: index.isVisible(layer.id) && !layer.maskSource ? undefined : "none",
                  width: layer.width,
                  height: layer.height,
                  transform: `matrix(${index.worldMatrix(layer.id).join(",")})`,
                  borderWidth: 1 / zoom,
                } as CSSProperties
              }
            >
              {locked && (
                <span
                  className="canvas-layer-lock"
                  role="img"
                  aria-label={t("layerControls:lockedState")}
                  style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
                >
                  <LockKeyhole size={16} aria-hidden="true" />
                </span>
              )}
              {!locked && (
                <SelectionEdges
                  layerId={layer.id}
                  name={layer.name}
                  onHandle={(event) => {
                    if (!controller.read().playback) onHandle(event);
                  }}
                />
              )}
              {!locked &&
                (["nw", "n", "ne", "w", "e", "sw", "s", "se", "rotate"] as const).map((handle) => (
                  <button
                    type="button"
                    key={handle}
                    className={`canvas-handle canvas-handle-${handle}`}
                    aria-label={`${handle === "rotate" ? t("rotate") : t("resize")} ${layer.name} ${handle}`}
                    style={{
                      transform:
                        handle === "rotate"
                          ? rotationHandlePlacement(index.worldMatrix(layer.id), zoom).transform
                          : `scale(${1 / zoom})`,
                    }}
                    data-layer-id={layer.id}
                    data-handle={handle}
                    onPointerDown={(event) => {
                      if (!controller.read().playback) onHandle(event);
                    }}
                  />
                ))}
              {selected.length === 1 && (
                <span
                  className="canvas-selection-size"
                  style={selectionSizeLabel(layer, index.worldMatrix(layer.id), zoom)}
                >
                  {Math.round(layer.width)} × {Math.round(layer.height)}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
