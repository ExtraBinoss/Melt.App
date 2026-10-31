import {
  useMemo,
  useRef,
  useState,
  useReducer,
  useEffect,
  useImperativeHandle,
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
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { Trash2, Scissors } from "lucide-react";
import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import { VectorSelect } from "./VectorSelect";
import { VectorZoom } from "./VectorZoom";
import { NumberInput } from "../../shared/NumberInput";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import "./messages";
import { VectorDraft } from "./draft";
export interface VectorEditorHandle {
  cancelGesture: () => boolean;
}
interface Props {
  ref?: Ref<VectorEditorHandle>;
  vector: VectorDefinition;
  fill: string;
  stroke: string;
  strokeWidth: number;
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
  matrix?: DOMMatrix;
  contour: number;
  node: number;
  handle?: "incoming" | "outgoing";
  mode: VectorNodeMode;
}
export default function VectorEditor({
  ref,
  vector,
  fill,
  stroke,
  strokeWidth,
  onPreview,
  onCommit,
  onCancel,
}: Props) {
  const { t } = useTranslation("vectorEditor");
  const [partIndex, setPartIndex] = useState(0),
    [contour, setContour] = useState(0),
    [selected, setSelected] = useState(0),
    [zoom, setZoom] = useState(1),
    [focus, setFocus] = useState<{ x: number; y: number } | null>(null),
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
    [bx = 0, by = 0, bw = 100, bh = 100] = box;
  const displayBox = [
    (focus?.x ?? bx + bw / 2) - (bw * 0.6) / zoom,
    (focus?.y ?? by + bh / 2) - (bh * 0.6) / zoom,
    (bw * 1.2) / zoom,
    (bh * 1.2) / zoom,
  ];
  const pending = useRef<number | null>(null);
  function stopFrame() {
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    pending.current = null;
  }
  function present() {
    if (pending.current === null)
      pending.current = requestAnimationFrame(() => {
        pending.current = null;
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
  function paint(nodes = true) {
    const root = svg.current;
    if (!root) return;
    const d = model.outline();
    root.querySelector<SVGPathElement>("[data-edit-path]")?.setAttribute("d", d);
    root.querySelector<SVGPathElement>(".vector-edit-outline")?.setAttribute("d", d);
    if (!nodes) return;
    root
      .querySelectorAll<SVGCircleElement>(
        `circle[data-node="${held.current?.node ?? ni}"][data-contour="${held.current?.contour ?? ci}"]`,
      )
      .forEach((circle) => {
        const item =
          model.paths[Number(circle.dataset.contour)]?.nodes[Number(circle.dataset.node)];
        if (!item) return;
        const p = circle.dataset.handle
          ? item[circle.dataset.handle as "incoming" | "outgoing"]
          : item;
        if (p) {
          circle.setAttribute("cx", String(p.x));
          circle.setAttribute("cy", String(p.y));
        }
      });
    root
      .querySelectorAll<SVGLineElement>(
        `[data-handle-line][data-node="${held.current?.node ?? ni}"][data-contour="${held.current?.contour ?? ci}"]`,
      )
      .forEach((line) => {
        const item = model.paths[Number(line.dataset.contour)]?.nodes[Number(line.dataset.node)],
          p = item?.[line.dataset.handleLine as "incoming" | "outgoing"];
        if (item && p)
          for (const [key, value] of Object.entries({ x1: item.x, y1: item.y, x2: p.x, y2: p.y }))
            line.setAttribute(key, String(value));
      });
  }
  function begin() {
    if (!held.current && node)
      held.current = {
        paths: structuredClone(model.paths),
        corners: structuredClone(model.corners),
        contour: ci,
        node: ni,
        mode: vectorNodeMode(node),
      };
  }
  function cancel() {
    stopFrame();
    const gesture = held.current;
    if (gesture) {
      model.restore(gesture.paths, gesture.corners);
      held.current = null;
      paint();
      refresh();
    }
    onCancel();
  }
  useEffect(
    () => () => {
      stopFrame();
      held.current = null;
      onCancel();
    },
    [onCancel, model],
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
    if (
      origin &&
      !Object.keys(style).length &&
      JSON.stringify(origin.paths) === JSON.stringify(model.paths) &&
      JSON.stringify(origin.corners) === JSON.stringify(model.corners)
    )
      return cancel();
    try {
      onCommit(draft(style));
      held.current = null;
      setError("");
      refresh();
    } catch {
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
    const matrix = svg.current?.getScreenCTM()?.inverse();
    if (!matrix || !path) return;
    setSelected(at);
    const item = path.nodes[at]!;
    held.current = {
      paths: structuredClone(model.paths),
      corners: structuredClone(model.corners),
      pointerId: event.pointerId,
      start: new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix),
      client: { x: event.clientX, y: event.clientY },
      anchor: {
        x: (handle ? item[handle] : item)?.x ?? item.x,
        y: (handle ? item[handle] : item)?.y ?? item.y,
      },
      matrix,
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
    const mapped = new DOMPoint(event.clientX, event.clientY).matrixTransform(gesture.matrix);
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
  const radius = Math.max(bw, bh) / 110 / zoom;
  if (model.error) return <p role="alert">{t(model.error)}</p>;
  return (
    <div
      className="vector-editor"
      onKeyDownCapture={(event) => {
        if (event.key === "Escape" && held.current) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <div className="vector-editor-stage">
        <svg
          ref={svg}
          role="group"
          aria-label={t("title")}
          viewBox={displayBox.join(" ")}
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
          {parts.map((p, i) => (
            <path
              key={i}
              data-edit-path={i === index ? "" : undefined}
              d={i === index ? model.outline() : p.path}
              transform={i === index || !p.matrix ? undefined : `matrix(${p.matrix.join(" ")})`}
              fill={
                vector.strokeOnly || p.fill === "none"
                  ? "none"
                  : vector.preserveColors && p.fill && p.fill !== "currentColor"
                    ? p.fill
                    : fill
              }
              stroke={
                p.stroke === "none"
                  ? "none"
                  : vector.preserveColors && p.stroke && p.stroke !== "currentColor"
                    ? p.stroke
                    : stroke
              }
              strokeWidth={
                vector.preserveColors
                  ? (p.strokeWidth ?? strokeWidth)
                  : strokeWidth || p.strokeWidth || (vector.strokeOnly || p.stroke ? 2 : 0)
              }
              strokeLinecap={p.linecap ?? "round"}
              strokeLinejoin={p.linejoin ?? "round"}
              fillRule={p.fillRule}
              opacity={p.opacity ?? 1}
              className={i !== index ? "vector-other-path" : undefined}
            />
          ))}
          <path d={model.outline()} className="vector-edit-outline" />
          {path?.nodes.map((item, i) => (
            <g key={i}>
              {i === ni &&
                (["incoming", "outgoing"] as const).map(
                  (key) =>
                    item[key] && (
                      <g key={key}>
                        <line
                          data-contour={ci}
                          data-node={i}
                          data-handle-line={key}
                          x1={item.x}
                          y1={item.y}
                          x2={item[key].x}
                          y2={item[key].y}
                        />
                        <circle
                          className="vector-control-handle"
                          data-contour={ci}
                          data-node={i}
                          data-handle={key}
                          cx={item[key].x}
                          cy={item[key].y}
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
                cx={item.x}
                cy={item.y}
                r={radius}
                role="button"
                tabIndex={0}
                aria-label={t("point", { index: i + 1 })}
                onPointerDown={(event) => start(event, i)}
                onFocus={() => setSelected(i)}
                onKeyDown={(event) => {
                  if (event.key === "Delete" || event.key === "Backspace") {
                    event.preventDefault();
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
        <VectorZoom
          onOut={() => {
            if (zoom / 1.25 <= 1) setFocus(null);
            setZoom((v) => Math.max(0.25, v / 1.25));
          }}
          onFit={() => {
            setFocus(null);
            setZoom(1);
          }}
          onIn={() => {
            if (node) setFocus({ x: node.x, y: node.y });
            setZoom((v) => Math.min(8, v * 1.25));
          }}
        />
      </div>
      <ScrollShadow className="vector-editor-settings-shadow">
        <div className="vector-editor-settings">
          <VectorSelect
            label={t("part")}
            value={String(index)}
            options={parts.map((_, i) => ({ value: String(i), label: `${t("part")} ${i + 1}` }))}
            onValueChange={(value) => {
              cancel();
              setPartIndex(Number(value));
              setContour(0);
              setSelected(0);
            }}
          />
          {model.paths.length > 1 && (
            <VectorSelect
              label={t("contour")}
              value={String(ci)}
              options={model.paths.map((_, i) => ({
                value: String(i),
                label: `${t("contour")} ${i + 1}`,
              }))}
              onValueChange={(value) => {
                setContour(Number(value));
                setSelected(0);
              }}
            />
          )}
          {node && path && (
            <>
              <strong>{t("point", { index: ni + 1 })}</strong>
              <div className="vector-point-fields">
                {(["x", "y"] as const).map((axis) => (
                  <NumberInput
                    key={`${ci}:${ni}:${axis}`}
                    label={axis.toUpperCase()}
                    value={node[axis]}
                    min={-100000}
                    max={100000}
                    onPreview={(value) => coordinate(axis, value, true)}
                    onCommit={(value) => coordinate(axis, value)}
                    onCancel={cancel}
                  />
                ))}
              </div>
              <VectorSelect
                label={t("mode")}
                value={vectorNodeMode(node)}
                options={(["corner", "smooth", "symmetric"] as const).map((value) => ({
                  value,
                  label: t(value),
                }))}
                onValueChange={(value) =>
                  change(() => setVectorNodeMode(path, ni, value as VectorNodeMode))
                }
              />
              <NumberInput
                key={`${ci}:${ni}:round`}
                label={t("round")}
                value={model.radius(ci, ni)}
                min={0}
                max={Math.max(bw, bh)}
                disabled={!canRoundVectorNode(path, ni)}
                onPreview={(value) => {
                  begin();
                  model.restore(held.current!.paths, held.current!.corners);
                  model.round(ci, ni, value);
                  paint(false);
                  onPreview(draft());
                }}
                onCommit={(value) => {
                  begin();
                  model.restore(held.current!.paths, held.current!.corners);
                  model.round(ci, ni, value);
                  commit();
                }}
                onCancel={cancel}
              />
              {!canRoundVectorNode(path, ni) && (
                <p className="muted-description">{t("roundHint")}</p>
              )}
              <div className="vector-node-actions">
                <Button
                  variant="outline"
                  disabled={!path.closed && ni === path.nodes.length - 1}
                  onClick={() => change(() => setSelected(splitVectorSegment(path, ni)))}
                >
                  <Scissors size={14} />
                  {t("add")}
                </Button>
                <Button
                  variant="outline"
                  disabled={path.nodes.length <= (path.closed ? 3 : 2)}
                  onClick={() =>
                    change(() => {
                      removeVectorNode(path, ni);
                      setSelected(Math.max(0, ni - 1));
                    })
                  }
                >
                  <Trash2 size={14} />
                  {t("remove")}
                </Button>
              </div>
              <label className="switch-row">
                <Label>{t("closed")}</Label>
                <Switch
                  aria-label={t("closed")}
                  checked={path.closed}
                  disabled={path.nodes.length < 3}
                  onCheckedChange={(closed) =>
                    change(() => {
                      model.close(ci, closed);
                    })
                  }
                />
              </label>
            </>
          )}
          <VectorSelect
            label={t("cap")}
            value={part.linecap ?? "round"}
            options={["butt", "round", "square"].map((value) => ({
              value,
              label: t(value === "round" ? "roundStyle" : value),
            }))}
            onValueChange={(linecap) => commit({ linecap: linecap as VectorPart["linecap"] })}
          />
          <VectorSelect
            label={t("join")}
            value={part.linejoin ?? "round"}
            options={["miter", "round", "bevel"].map((value) => ({
              value,
              label: t(value === "round" ? "roundStyle" : value),
            }))}
            onValueChange={(linejoin) => commit({ linejoin: linejoin as VectorPart["linejoin"] })}
          />
          <p className="muted-description">{t("hint")}</p>
          {error && <p role="alert">{t(error)}</p>}
        </div>
      </ScrollShadow>
    </div>
  );
}
