import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  createLayerGeometryIndex,
  getEffectParameter,
  getEffectDefinition,
  invertMatrix,
  transformPoint,
  MAX_LIQUIFY_DABS,
  type Effect,
  type EnginePort,
  type LiquifyDab,
} from "@musart/core";
import { sourceGeometry } from "../selection/frame-geometry";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import { motionTimeChanges } from "../../state/session/motion-edit";
import { attachmentSelection } from "../../state/selection/attachments";
import { useLayerPreview } from "../../components/layers/controls/use-layer-preview";
interface Props {
  engine: EnginePort;
  controller: SceneController;
  viewSource: ViewSource;
  layerId: string;
  effect: Effect;
  onError?: (message: string) => void;
}
const value = (effect: Effect, key: string) =>
  getEffectParameter(
    effect,
    getEffectDefinition("liquify").parameters.find((p) => p.key === key)!,
  );
/** Round brush over the selected attachment. Drafts stay imperative and each release commits once. */
export function LiquifyBrush({ engine, controller, viewSource, layerId, effect, onError }: Props) {
  const { t } = useTranslation("liquifyFx");
  const root = useRef<SVGSVGElement>(null),
    circle = useRef<SVGCircleElement>(null);
  const page = engine
    .getSnapshot()
    .project.pages.find((p) => p.id === engine.getSnapshot().pageId)!;
  const preview = useLayerPreview(
    engine,
    page,
    [layerId],
    (task) => {
      try {
        task();
      } catch (error) {
        onError?.(String(error));
      }
    },
    true,
  );
  const held = useRef<{
    pointerId: number;
    snapshot: ReturnType<EnginePort["getSnapshot"]>;
    layer: (typeof page.layers)[number];
    pose: { width: number; height: number };
    effect: Effect;
    next: LiquifyDab[];
    last: { x: number; y: number };
    inverse: ReturnType<typeof invertMatrix>;
    radius: number;
    strength: number;
    hardness: number;
    mode: LiquifyDab["mode"];
    warned: boolean;
  } | null>(null);
  const cancelPreview = preview.cancel;
  const cancel = useCallback(() => {
    const gesture = held.current;
    held.current = null;
    cancelPreview();
    if (gesture && root.current?.hasPointerCapture(gesture.pointerId))
      root.current.releasePointerCapture(gesture.pointerId);
  }, [cancelPreview]);
  useEffect(() => {
    const change = () => {
      if (held.current && engine.getSnapshot() !== held.current.snapshot) cancel();
    };
    const hidden = () => {
      if (document.hidden) cancel();
    };
    const stop = engine.subscribe(change);
    const stopClock = motionTimeChanges(engine).subscribe(() => {
      if (held.current) cancel();
    });
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      stop();
      stopClock();
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
      cancel();
    };
  }, [engine, cancel]);
  useLayoutEffect(() => {
    const paint = () => {
      const svg = root.current,
        frame = controller.read();
      if (!svg) return;
      const layer = frame.page.layers.find((l) => l.id === layerId),
        index = sourceGeometry(controller);
      const current = layer?.effects.find((e) => e.id === effect.id);
      const hidden =
        !layer ||
        !current?.enabled ||
        frame.playback ||
        !index.isVisible(layerId) ||
        index.isLocked(layerId) ||
        !!layer.spatial?.enabled ||
        !!layer.spatialContext ||
        index.ancestors(layerId).some((p) => p.spatial?.enabled || p.spatialContext);
      svg.style.display = hidden ? "none" : "";
      if (!layer) return;
      svg
        .querySelector("g")
        ?.setAttribute("transform", `matrix(${index.worldMatrix(layerId).join(" ")})`);
      const rect = svg.querySelector("rect")!;
      rect.setAttribute("width", String(layer.width));
      rect.setAttribute("height", String(layer.height));
      circle.current?.setAttribute("r", String(Number(value(current ?? effect, "brushRadius"))));
      circle.current?.setAttribute("stroke-width", String(1 / viewSource.read().zoom));
    };
    paint();
    const stop = controller.subscribe(paint),
      stopView = viewSource.subscribe(paint);
    return () => {
      stop();
      stopView();
    };
  }, [controller, effect, layerId, viewSource]);
  function point(event: PointerEvent<SVGSVGElement>, inverse = held.current?.inverse) {
    const bounds = root.current!.getBoundingClientRect(),
      page = controller.read().page;
    const matrix = inverse ?? invertMatrix(sourceGeometry(controller).worldMatrix(layerId));
    const at = transformPoint(matrix, {
      x: ((event.clientX - bounds.left) * page.width) / bounds.width,
      y: ((event.clientY - bounds.top) * page.height) / bounds.height,
    });
    const layer = held.current?.pose ?? page.layers.find((l) => l.id === layerId)!;
    return {
      x: Math.max(-layer.width, Math.min(layer.width * 2, at.x)),
      y: Math.max(-layer.height, Math.min(layer.height * 2, at.y)),
    };
  }
  function draw(event: PointerEvent<SVGSVGElement>, force = false) {
    const at = point(event);
    if (circle.current) {
      circle.current.style.display = "";
      circle.current.setAttribute("cx", String(at.x));
      circle.current.setAttribute("cy", String(at.y));
    }
    const gesture = held.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (engine.getSnapshot() !== gesture.snapshot || controller.read().playback) {
      cancel();
      return;
    }
    const dx = at.x - gesture.last.x,
      dy = at.y - gesture.last.y,
      distance = Math.hypot(dx, dy);
    if (distance < (force ? 0.1 : Math.max(1, gesture.radius * 0.15))) return;
    if (gesture.next.length >= MAX_LIQUIFY_DABS) {
      if (!gesture.warned) {
        gesture.warned = true;
        onError?.(t("capacity"));
      }
      return;
    }
    const start = gesture.last;
    const steps = Math.ceil(distance / Math.max(1, gesture.radius * 0.25));
    const available = MAX_LIQUIFY_DABS - gesture.next.length;
    const count = Math.min(steps, available);
    const strength =
      gesture.strength *
      (event.pointerType === "pen" && value(gesture.effect, "stylusPressure")
        ? Math.max(0, Math.min(1, event.pressure))
        : 1);
    for (let i = 1; i <= count; i++) {
      gesture.next.push({
        x: (start.x + (dx * i) / steps) / gesture.pose.width,
        y: (start.y + (dy * i) / steps) / gesture.pose.height,
        dx: dx / steps / gesture.pose.width,
        dy: dy / steps / gesture.pose.height,
        radius: gesture.radius / Math.min(gesture.pose.width, gesture.pose.height),
        strength,
        hardness: gesture.hardness,
        mode: gesture.mode,
      });
    }
    gesture.last = { x: start.x + (dx * count) / steps, y: start.y + (dy * count) / steps };
    if (count < steps && !gesture.warned) {
      gesture.warned = true;
      onError?.(t("capacity"));
    }
    preview.preview({
      effects: gesture.layer.effects.map((e) =>
        e.id === effect.id ? { ...e, liquify: [...gesture.next] } : e,
      ),
    });
  }
  return (
    <svg
      ref={root}
      className="effect-gizmo liquify-brush"
      data-effect-gizmo-id={effect.id}
      data-canvas-control
      aria-label={t("brushHint")}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (held.current) cancel();
          else attachmentSelection(engine).clear();
        }
      }}
      onPointerDown={(event) => {
        if (
          event.button !== 0 ||
          held.current ||
          controller.read().playback ||
          !attachmentSelection(engine).editable()
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        root.current!.focus();
        const snapshot = engine.getSnapshot(),
          page = snapshot.project.pages.find((p) => p.id === snapshot.pageId)!,
          layer = page.layers.find((l) => l.id === layerId),
          current = layer?.effects.find((e) => e.id === effect.id);
        if (!layer || !current?.enabled) return;
        const geometry = createLayerGeometryIndex(page);
        if (
          !geometry.isVisible(layer.id) ||
          geometry.isLocked(layer.id) ||
          layer.spatial?.enabled ||
          layer.spatialContext ||
          geometry.ancestors(layer.id).some((p) => p.spatial?.enabled || p.spatialContext)
        )
          return;
        if ((current.liquify?.length ?? 0) >= MAX_LIQUIFY_DABS) {
          onError?.(t("capacity"));
          return;
        }
        const presented = controller.read().page.layers.find((l) => l.id === layerId);
        if (!presented) return;
        const brushEffect = presented.effects.find((e) => e.id === effect.id) ?? current;
        const inverse = invertMatrix(sourceGeometry(controller).worldMatrix(layerId));
        preview.beginOnPage(page);
        root.current!.setPointerCapture(event.pointerId);
        held.current = {
          pointerId: event.pointerId,
          snapshot,
          layer,
          pose: { width: presented.width, height: presented.height },
          effect: current,
          inverse,
          next: [...(current.liquify ?? [])],
          last: point(event, inverse),
          radius: Number(value(brushEffect, "brushRadius")),
          strength: Number(value(brushEffect, "brushStrength")),
          hardness: Number(value(brushEffect, "brushHardness")),
          mode: value(brushEffect, "brushMode") as LiquifyDab["mode"],
          warned: false,
        };
        // A click can pinch/inflate/twirl without creating a synthetic move.
        if (held.current.mode !== "push") {
          held.current.last = { x: held.current.last.x - 0.2, y: held.current.last.y };
          draw(event, true);
        }
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        draw(event);
      }}
      onPointerUp={(event) => {
        if (held.current?.pointerId !== event.pointerId) return;
        event.stopPropagation();
        draw(event, true);
        const gesture = held.current;
        held.current = null;
        if (!gesture) return;
        if (gesture.next.length !== (gesture.effect.liquify?.length ?? 0))
          preview.commit({
            effects: gesture.layer.effects.map((e) =>
              e.id === effect.id ? { ...e, liquify: gesture.next } : e,
            ),
          });
        else preview.cancel();
        if (root.current?.hasPointerCapture(event.pointerId))
          root.current.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={() => {
        if (held.current) cancel();
      }}
      onPointerLeave={() => {
        if (!held.current && circle.current) circle.current.style.display = "none";
      }}
    >
      <g>
        <rect className="liquify-brush-hit" data-canvas-control />
        <circle ref={circle} className="liquify-brush-ring" style={{ display: "none" }} />
      </g>
    </svg>
  );
}
