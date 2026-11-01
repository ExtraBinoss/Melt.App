import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useStore } from "jotai";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import { previewAtom } from "../../state/session/editor";
import { motionTimeChanges } from "../../state/session/motion-edit";
import type { PreviewValue } from "../../state/session/preview-source";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import { sourceGeometry, sourcePagePoint } from "../selection/frame-geometry";
import { canvasSelectionHit } from "../selection/hit";
import { createCanvasTextSession, type CanvasTextSession } from "./session";
import "./text-editing.css";

/** Only this leaf mounts on double-click; native typing publishes directly to the scene. */
export function CanvasTextEditing({
  engine,
  controller,
  viewSource,
  viewport,
  enabled,
  onError,
}: {
  engine: EnginePort;
  controller: SceneController;
  viewSource: ViewSource;
  viewport: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  onError?: (error: string) => void;
}) {
  const { t } = useTranslation();
  const store = useStore();
  const [editing, setEditing] = useState<CanvasTextSession | null>(null);
  const active = useRef<CanvasTextSession | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const ownedPreview = useRef<PreviewValue | null>(null);
  const clearPreview = useCallback(() => {
    if (ownedPreview.current && store.get(previewAtom) === ownedPreview.current)
      store.set(previewAtom, null);
    ownedPreview.current = null;
  }, [store]);
  const finish = useCallback(
    (commit: boolean, focus = false) => {
      const session = active.current;
      active.current = null;
      if (!session) return;
      try {
        if (commit) session.commit();
        else session.cancel();
      } catch (error) {
        onError?.(error instanceof Error ? error.message : String(error));
      } finally {
        setEditing(null);
        if (focus) viewport.current?.focus({ preventScroll: true });
      }
    },
    [onError, viewport],
  );
  useEffect(() => {
    const element = viewport.current;
    if (!element || !enabled) return;
    const doubleClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        controller.read().playback ||
        (event.target as Element).closest("[data-canvas-control]")
      )
        return;
      const point = sourcePagePoint(controller, element, viewSource, event);
      const hit = canvasSelectionHit(
        controller.read().page,
        point,
        engine.getSnapshot().selection,
        sourceGeometry(controller),
      );
      if (!hit || hit.locked || hit.layer.kind !== "text") return;
      event.preventDefault();
      active.current?.cancel();
      engine.select([hit.layer.id]);
      const session = createCanvasTextSession(
        engine,
        hit.layer,
        (patch) => {
          const value: PreviewValue = { target: "layer", layerId: hit.layer.id, patch };
          ownedPreview.current = value;
          store.set(previewAtom, value);
        },
        clearPreview,
      );
      active.current = session;
      setEditing(session);
    };
    element.addEventListener("dblclick", doubleClick, true);
    return () => element.removeEventListener("dblclick", doubleClick, true);
  }, [engine, controller, viewSource, viewport, enabled, store, clearPreview]);
  useEffect(() => {
    const invalidate = () => {
      if (active.current && (!active.current.current() || controller.read().playback))
        finish(false);
    };
    const stops = [
      engine.subscribe(invalidate),
      motionTimeChanges(engine).subscribe(invalidate),
      controller.subscribe(invalidate),
    ];
    return () => {
      for (const stop of stops) stop();
      active.current?.cancel();
      active.current = null;
    };
  }, [engine, controller, finish]);
  useEffect(() => {
    if (!enabled) finish(false);
  }, [enabled, finish]);
  useLayoutEffect(() => {
    const field = input.current,
      element = viewport.current;
    if (!editing || !field || !element) return;
    const paint = () => {
      const frame = controller.read(),
        geometry = sourceGeometry(controller),
        layer = geometry.byId.get(editing.layer.id);
      if (!layer) return;
      const [a, b, c, d, e, f] = geometry.worldMatrix(layer.id),
        view = viewSource.read(),
        zoom = view.zoom,
        x = element.clientWidth / 2 + view.x + (e - frame.page.width / 2) * zoom,
        y = element.clientHeight / 2 + view.y + (f - frame.page.height / 2) * zoom;
      field.style.transform = `matrix(${a * zoom},${b * zoom},${c * zoom},${d * zoom},${x},${y})`;
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(element);
    const stops = [controller.subscribe(paint), viewSource.subscribe(paint)];
    field.focus({ preventScroll: true });
    field.select();
    return () => {
      observer.disconnect();
      for (const stop of stops) stop();
    };
  }, [editing, controller, viewSource, viewport]);
  if (!editing) return null;
  const layer = editing.layer;
  return (
    <textarea
      key={layer.id}
      ref={input}
      data-canvas-control
      data-testid="canvas-text-editor"
      className="canvas-text-editor"
      aria-label={t("textContent")}
      defaultValue={layer.text}
      spellCheck={false}
      style={{
        width: layer.width,
        height: layer.height,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        fontWeight: layer.fontWeight,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing,
        textAlign: layer.textAlign,
      }}
      onChange={(event) => active.current?.preview(event.currentTarget.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false, true);
        } else if (
          event.key === "Enter" &&
          (event.ctrlKey || event.metaKey) &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          finish(true, true);
        }
      }}
    />
  );
}
