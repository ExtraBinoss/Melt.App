import { useEffect, useSyncExternalStore, type RefObject } from "react";
import { useAtom } from "jotai";
import { AnimatePresence } from "motion/react";
import { createLayerGeometryIndex, type EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Move3D, Rotate3D, Scaling, Spline } from "lucide-react";
import { useEngine } from "../../state/session/editor";
import {
  spatialEditingAtom,
  spatialEditingTarget,
  type SpatialEditTool,
} from "../../state/session/spatial-editing";
import { vectorEditingAtom, vectorEditingTarget } from "../../state/session/vector-editing";
import { createMotionTransport } from "../../services/motion/transport";
import { SegmentedTabs } from "../../components/shared/segmented/SegmentedTabs";
import { IconButton } from "../../components/shared/IconButton";
import { ObjectToolbar } from "../shared/ObjectToolbar";
import { clientToPage } from "../viewport/view";
import { canvasHit } from "../selection/hit";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import "../../components/spatial/messages";
import "../../components/spatial/spatial.css";
export interface SpatialCanvasProps {
  engine: EnginePort;
  controller: SceneController;
  viewSource: ViewSource;
  viewport: RefObject<HTMLDivElement | null>;
  enabled: boolean;
}
export function CanvasSpatialEditing({
  engine,
  controller,
  viewSource,
  viewport,
  enabled,
}: SpatialCanvasProps) {
  const snapshot = useEngine(engine),
    { t } = useTranslation("spatial");
  const [editing, setEditing] = useAtom(spatialEditingAtom(engine)),
    [vector, setVector] = useAtom(vectorEditingAtom(engine));
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const index = createLayerGeometryIndex(page);
  const layer =
    snapshot.selection.length === 1 ? index.byId.get(snapshot.selection[0]!) : undefined;
  const supported = layer?.spatial?.enabled && !index.isLocked(layer.id);
  const playback = useSyncExternalStore(controller.subscribe, () =>
    Boolean(controller.read().playback),
  );
  const active = Boolean(
    enabled &&
    !playback &&
    supported &&
    editing?.projectId === snapshot.project.id &&
    editing.pageId === page.id &&
    editing.layerId === layer?.id,
  );
  const visible = enabled && supported && !playback && !vector;
  function enter() {
    if (!layer || !supported) return;
    createMotionTransport(engine).pause();
    setVector(null);
    setEditing(spatialEditingTarget(engine, layer.id));
    viewport.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (editing && !active) setEditing(null);
  }, [editing, active, setEditing]);
  useEffect(() => () => setEditing(null), [setEditing]);
  useEffect(() => {
    const element = viewport.current;
    if (!element || !enabled || !supported || !layer) return;
    const click = (event: MouseEvent) => {
      if (
        event.detail !== 3 ||
        event.button !== 0 ||
        controller.read().playback ||
        (event.target as Element).closest("[data-canvas-control]")
      )
        return;
      const frame = controller.read(),
        point = clientToPage(
          { x: event.clientX, y: event.clientY },
          element.getBoundingClientRect(),
          viewSource.read(),
          frame.page,
        );
      if (canvasHit(frame.page, point)?.layer.id !== layer.id) return;
      event.preventDefault();
      event.stopPropagation();
      createMotionTransport(engine).pause();
      setVector(null);
      setEditing(spatialEditingTarget(engine, layer.id));
      element.focus({ preventScroll: true });
    };
    element.addEventListener("click", click, true);
    return () => element.removeEventListener("click", click, true);
  }, [controller, engine, enabled, layer, setEditing, setVector, supported, viewSource, viewport]);
  return (
    <AnimatePresence>
      {visible && layer && (
        <ObjectToolbar
          key={`${snapshot.project.id}:${page.id}:${layer.id}`}
          layerId={layer.id}
          controller={controller}
          view={viewSource}
          viewport={viewport}
          allowDraft
          className="canvas-object-toolbar"
        >
          <div className="spatial-canvas-toolbar" data-spatial-toolbar>
            <SegmentedTabs
              mode="choice"
              size="compact"
              label={t("mode")}
              value={active ? "3d" : "2d"}
              items={[
                { value: "2d", label: t("flat") },
                { value: "3d", label: t("volume") },
              ]}
              onValueChange={(value) => {
                if (value === "3d") enter();
                else setEditing(null);
              }}
            />
            {active &&
              (
                [
                  ["translate", Move3D, "G"],
                  ["rotate", Rotate3D, "R"],
                  ["scale", Scaling, "S"],
                ] as const
              ).map(([tool, Icon, shortcut]) => (
                <IconButton
                  key={tool}
                  label={t(tool)}
                  shortcut={shortcut}
                  active={editing?.tool === tool}
                  onClick={() => {
                    setEditing((current) =>
                      current ? { ...current, tool: tool as SpatialEditTool } : current,
                    );
                    viewport.current?.focus({ preventScroll: true });
                  }}
                >
                  <Icon size={14} />
                </IconButton>
              ))}
            {!active && layer.kind === "vector" && (
              <IconButton
                label={t("vectorEditor:edit")}
                onClick={() => {
                  setEditing(null);
                  setVector(vectorEditingTarget(engine, layer.id));
                }}
              >
                <Spline size={14} />
              </IconButton>
            )}
          </div>
        </ObjectToolbar>
      )}
    </AnimatePresence>
  );
}
