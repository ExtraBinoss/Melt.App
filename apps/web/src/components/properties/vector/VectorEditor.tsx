import {
  useMemo,
  useCallback,
  useRef,
  useState,
  useReducer,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  type CSSProperties,
  type Ref,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  moveVectorNode,
  moveVectorHandle,
  vectorNodeMode,
  setVectorNodeMode,
  splitVectorSegment,
  removeVectorNode,
  canRoundVectorNode,
  type VectorDefinition,
  type VectorPart,
  type VectorSubpath,
  type VectorCorner,
  type VectorNodeMode,
  type Matrix,
  invertMatrix,
  transformPoint,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import type { VectorControls } from "./VectorSettings";
import { VectorCanvasToolbar } from "./VectorCanvasToolbar";
import type { VectorSurface } from "./surface";
import { vectorScreenMatrix } from "../../../canvas/vector/geometry";
import { vectorContrast } from "../../../canvas/vector/contrast";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
  type GestureOrigin,
} from "../../../canvas/interaction/gesture-origin";
import "./messages";
import { VectorDraft } from "./draft";
import { paintVector } from "./presentation";
export interface VectorEditorHandle {
  cancelGesture: () => boolean;
}
interface Props {
  ref?: Ref<VectorEditorHandle>;
  surface: VectorSurface;
  onDone: () => void;
  vector: VectorDefinition;
  fill: string;
  stroke: string;
  onPreview: (v: VectorDefinition) => void;
  onCommit: (v: VectorDefinition) => void;
  onCancel: () => void;
}
interface Gesture {
  paths: VectorSubpath[];
  corners: VectorCorner[];
  pointerId?: number;
  start?: { x: number; y: number };
  anchor?: { x: number; y: number };
  client?: { x: number; y: number };
  moved?: boolean;
  matrix?: Matrix;
  rect?: { left: number; top: number };
  origin: GestureOrigin;
  contour: number;
  node: number;
  handle?: "incoming" | "outgoing";
  mode: VectorNodeMode;
}
export default function VectorEditor({
  ref,
  surface,
  onDone,
  vector,
  fill,
  stroke,
  onPreview,
  onCommit,
  onCancel,
}: Props) {
  const { t } = useTranslation("vectorEditor");
  const [partIndex, setPartIndex] = useState(0),
    [contour, setContour] = useState(0),
    [selected, setSelected] = useState(0),
    [error, setError] = useState("");
  const [, refresh] = useReducer((n) => n + 1, 0);
  const svg = useRef<SVGSVGElement>(null),
    held = useRef<Gesture | null>(null);
  const parts = vector.parts ?? [{ path: vector.path ?? "" }];
  const index = Math.min(partIndex, parts.length - 1),
    part = parts[index]!;
  const model = useMemo(
    () => new VectorDraft(vector.parts?.[index] ?? { path: vector.path ?? "" }),
    [vector, index],
  );
  const ci = Math.min(contour, Math.max(0, model.paths.length - 1)),
    path = model.paths[ci],
    ni = Math.min(selected, Math.max(0, (path?.nodes.length ?? 1) - 1)),
    node = path?.nodes[ni];
  const box = vector.viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number),
    [, , bw = 100, bh = 100] = box;
  const matrix = useRef<Matrix>([1, 0, 0, 1, 0, 0]);
  const contrast = useMemo(() => vectorContrast(vector, fill, stroke), [vector, fill, stroke]);
  const pending = useRef<number | null>(null);
  const stopFrame = useCallback(() => {
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    pending.current = null;
  }, []);
  function present() {
    if (pending.current === null)
      pending.current = requestAnimationFrame(() => {
        pending.current = null;
        if (held.current && !isGestureOriginCurrent(surface.engine, held.current.origin)) {
          cancel();
          return;
        }
        paint();
        onPreview(draft());
      });
  }
  function draft(style: Partial<VectorPart> = {}): VectorDefinition {
    const next = {
      ...vector,
      parts: parts.map((p, i) => {
        if (i !== index) return p;
        return model.part(p, style);
      }),
    };
    delete next.path;
    return next;
  }
  const paint = useCallback(
    (nodes = true) => {
      if (svg.current) paintVector(svg.current, model, matrix.current, nodes);
    },
    [model],
  );
  function begin() {
    if (!held.current && node)
      held.current = {
        origin: captureGestureOrigin(surface.engine),
        paths: structuredClone(model.paths),
        corners: structuredClone(model.corners),
        contour: ci,
        node: ni,
        mode: vectorNodeMode(node),
      };
  }
  const cancel = useCallback(() => {
    stopFrame();
    const gesture = held.current;
    if (gesture) {
      model.restore(gesture.paths, gesture.corners);
      held.current = null;
      paint();
      refresh();
    }
    onCancel();
  }, [model, paint, stopFrame, onCancel]);
  useEffect(
    () => () => {
      stopFrame();
      held.current = null;
      onCancel();
    },
    [onCancel, model, stopFrame],
  );
  useImperativeHandle(ref, () => ({
    cancelGesture() {
      if (!held.current) return false;
      cancel();
      return true;
    },
  }));
  function commit(style: Partial<VectorPart> = {}) {
    stopFrame();
    const origin = held.current;
    if (origin && !isGestureOriginCurrent(surface.engine, origin.origin)) {
      cancel();
      return;
    }
    if (
      origin &&
      !Object.keys(style).length &&
      JSON.stringify(origin.paths) === JSON.stringify(model.paths) &&
      JSON.stringify(origin.corners) === JSON.stringify(model.corners)
    )
      return cancel();
    try {
      const next = draft(style);
      held.current = null;
      onCommit(next);
      setError("");
      refresh();
    } catch {
      held.current = origin;
      cancel();
      setError("failed");
    }
  }
  function change(action: () => void) {
    try {
      begin();
      const anchors = model.anchors();
      action();
      model.reconcile(anchors);
      commit();
    } catch (e) {
      cancel();
      setError(e instanceof Error && e.message === "VECTOR_MINIMUM_NODES" ? "minimum" : "failed");
    }
  }
  function start(
    event: ReactPointerEvent<SVGCircleElement>,
    at: number,
    handle?: "incoming" | "outgoing",
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = surface.viewport.current?.getBoundingClientRect();
    if (!rect || !path) return;
    let inverse: Matrix;
    try {
      inverse = invertMatrix(matrix.current);
    } catch {
      setError("failed");
      return;
    }
    setSelected(at);
    const item = path.nodes[at]!;
    held.current = {
      origin: captureGestureOrigin(surface.engine),
      paths: structuredClone(model.paths),
      corners: structuredClone(model.corners),
      pointerId: event.pointerId,
      start: transformPoint(inverse, { x: event.clientX - rect.left, y: event.clientY - rect.top }),
      rect,
      client: { x: event.clientX, y: event.clientY },
      anchor: {
        x: (handle ? item[handle] : item)?.x ?? item.x,
        y: (handle ? item[handle] : item)?.y ?? item.y,
      },
      matrix: inverse,
      contour: ci,
      node: at,
      handle,
      mode: vectorNodeMode(item),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: ReactPointerEvent<SVGSVGElement>) {
    const gesture = held.current;
    if (!gesture?.matrix || gesture.pointerId !== event.pointerId) return;
    if (
      !gesture.moved &&
      Math.hypot(event.clientX - gesture.client!.x, event.clientY - gesture.client!.y) < 2
    )
      return;
    gesture.moved = true;
    if (!isGestureOriginCurrent(surface.engine, gesture.origin)) {
      cancel();
      return;
    }
    const mapped = transformPoint(gesture.matrix, {
      x: event.clientX - gesture.rect!.left,
      y: event.clientY - gesture.rect!.top,
    });
    const point = {
      x: gesture.anchor!.x + mapped.x - gesture.start!.x,
      y: gesture.anchor!.y + mapped.y - gesture.start!.y,
    };
    const item = model.paths[gesture.contour]!.nodes[gesture.node]!;
    const current = gesture.handle ? (item[gesture.handle] ?? item) : item;
    if (Math.hypot(point.x - current.x, point.y - current.y) < 1e-6) return;
    if (gesture.handle)
      moveVectorHandle(item, gesture.handle, point, event.altKey ? "corner" : gesture.mode);
    else moveVectorNode(item, point);
    present();
  }
  function coordinate(axis: "x" | "y", value: number, preview = false) {
    if (!node) return;
    begin();
    moveVectorNode(node, { x: axis === "x" ? value : node.x, y: axis === "y" ? value : node.y });
    paint();
    if (preview) onPreview(draft());
    else commit();
  }
  useLayoutEffect(() => {
    const root = svg.current,
      viewport = surface.viewport.current;
    if (!root || !viewport) return;
    let previousView = surface.view.read();
    let size = { width: viewport.clientWidth, height: viewport.clientHeight };
    function reproject() {
      const frame = surface.controller.read(),
        layer = frame.page.layers.find((l) => l.id === surface.layerId);
      if (!layer?.vector || frame.playback) {
        cancel();
        onDone();
        return;
      }
      const view = surface.view.read();
      if (
        held.current &&
        (view.x !== previousView.x ||
          view.y !== previousView.y ||
          view.zoom !== previousView.zoom ||
          !isGestureOriginCurrent(surface.engine, held.current.origin))
      )
        cancel();
      previousView = view;
      const { width, height } = size;
      const nextMatrix = vectorScreenMatrix(frame.page, layer, view, { width, height });
      if (
        held.current &&
        nextMatrix.some((value, index) => Math.abs(value - matrix.current[index]!) > 1e-8)
      )
        cancel();
      matrix.current = nextMatrix;
      const box = `0 0 ${Math.max(1, width)} ${Math.max(1, height)}`,
        transform = `matrix(${matrix.current.join(" ")})`;
      if (root!.getAttribute("viewBox") !== box) root!.setAttribute("viewBox", box);
      const outlines = root!.querySelector("[data-vector-outlines]");
      if (outlines?.getAttribute("transform") !== transform)
        outlines?.setAttribute("transform", transform);
      paint();
    }
    reproject();
    const resize = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect;
      if (bounds && (bounds.width !== size.width || bounds.height !== size.height)) {
        if (held.current) cancel();
        size = { width: bounds.width, height: bounds.height };
      }
      reproject();
    });
    window.addEventListener("blur", cancel);
    resize.observe(viewport);
    const stops = [
      surface.controller.subscribe(reproject),
      surface.view.subscribe(reproject),
      surface.engine.subscribe(() => {
        if (held.current && !isGestureOriginCurrent(surface.engine, held.current.origin)) cancel();
      }),
    ];
    return () => {
      resize.disconnect();
      window.removeEventListener("blur", cancel);
      for (const stop of stops) stop();
    };
  }, [surface, model, cancel, onDone, paint]);
  useLayoutEffect(() => paint());
  const controls: VectorControls = {
    index,
    parts: parts.length,
    contour: ci,
    contours: model.paths.length,
    part,
    maxRadius: Math.max(bw, bh),
    point:
      node && path
        ? {
            index: ni,
            x: node.x,
            y: node.y,
            mode: vectorNodeMode(node),
            radius: model.radius(ci, ni),
            canRound: canRoundVectorNode(path, ni),
            canRemove: path.nodes.length > (path.closed ? 3 : 2),
            canSplit: path.closed || ni < path.nodes.length - 1,
            closed: path.closed,
          }
        : undefined,
    selectPart(value) {
      cancel();
      setPartIndex(value);
      setContour(0);
      setSelected(0);
    },
    selectContour(value) {
      cancel();
      setContour(value);
      setSelected(0);
    },
    coordinate,
    round(value, preview = false) {
      begin();
      if (!held.current) return;
      model.restore(held.current.paths, held.current.corners);
      model.round(ci, ni, value);
      paint(false);
      if (preview) onPreview(draft());
      else commit();
    },
    split: () => path && change(() => setSelected(splitVectorSegment(path, ni))),
    remove: () =>
      path &&
      change(() => {
        removeVectorNode(path, ni);
        setSelected(Math.max(0, ni - 1));
      }),
    close: (closed) => path && change(() => model.close(ci, closed)),
    style: commit,
    cancel,
  };
  const radius = 4.5;
  if (model.error)
    return (
      <aside className="vector-canvas-toolbar floating-panel" data-canvas-control>
        <p role="alert">{t(model.error)}</p>
        <Button onClick={onDone}>{t("close")}</Button>
      </aside>
    );
  return (
    <div
      className="vector-editor vector-editor-inline"
      data-keybinding-capture
      data-document-shortcuts
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
      }}
      style={{ "--vector-ink": contrast.ink, "--vector-halo": contrast.halo } as CSSProperties}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          if (held.current) {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          } else if (
            !(event.target as Element).closest(
              '[data-slot="popover-content"],[role="listbox"],[role="menu"]',
            )
          ) {
            event.preventDefault();
            event.stopPropagation();
            onDone();
          }
        }
      }}
    >
      <div className="vector-editor-stage">
        <svg
          ref={svg}
          role="group"
          aria-label={t("title")}
          data-canvas-control
          data-vector-stage
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={move}
          onPointerUp={(event) => {
            if (held.current?.pointerId === event.pointerId) {
              move(event);
              commit();
            }
          }}
          onPointerCancel={cancel}
          onLostPointerCapture={() => {
            if (held.current?.pointerId !== undefined) cancel();
          }}
        >
          <g data-vector-outlines>
            <path d={model.outline()} className="vector-edit-outline vector-outline-halo" />
            <path d={model.outline()} className="vector-edit-outline" />
          </g>
          {path?.nodes.map((item, i) => (
            <g key={i}>
              {i === ni &&
                (["incoming", "outgoing"] as const).map(
                  (key) =>
                    item[key] && (
                      <g key={key}>
                        <line
                          className="vector-handle-halo"
                          data-contour={ci}
                          data-node={i}
                          data-handle-line={key}
                          x1={0}
                          y1={0}
                          x2={0}
                          y2={0}
                        />
                        <line
                          data-contour={ci}
                          data-node={i}
                          data-handle-line={key}
                          x1={0}
                          y1={0}
                          x2={0}
                          y2={0}
                        />
                        <circle
                          className="vector-control-handle"
                          data-contour={ci}
                          data-node={i}
                          data-handle={key}
                          cx={0}
                          cy={0}
                          r={radius * 0.75}
                          aria-label={t(key)}
                          onPointerDown={(event) => start(event, i, key)}
                        />
                      </g>
                    ),
                )}
              <circle
                className="vector-anchor"
                data-selected={i === ni || undefined}
                data-contour={ci}
                data-node={i}
                cx={0}
                cy={0}
                r={i === ni ? radius : 3}
                role="button"
                tabIndex={0}
                aria-label={t("point", { index: i + 1 })}
                onPointerDown={(event) => start(event, i)}
                onFocus={() => setSelected(i)}
                onKeyDown={(event) => {
                  if (event.key === "Delete" || event.key === "Backspace") {
                    event.preventDefault();
                    event.stopPropagation();
                    change(() => removeVectorNode(path, i));
                    return;
                  }
                  const offset = event.shiftKey ? 10 : 1,
                    delta = {
                      ArrowLeft: [-offset, 0],
                      ArrowRight: [offset, 0],
                      ArrowUp: [0, -offset],
                      ArrowDown: [0, offset],
                    }[event.key];
                  if (delta) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSelected(i);
                    change(() =>
                      moveVectorNode(item, { x: item.x + delta[0]!, y: item.y + delta[1]! }),
                    );
                  }
                }}
              />
            </g>
          ))}
        </svg>
      </div>
      <VectorCanvasToolbar
        controls={controls}
        onMode={(value) => path && change(() => setVectorNodeMode(path, ni, value))}
        onDone={onDone}
      />
      {error && (
        <p className="vector-canvas-error" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
