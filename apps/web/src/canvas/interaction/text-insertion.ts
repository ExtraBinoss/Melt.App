import {
  createLayer,
  createSpatialLayer,
  createSpatialScene,
  type EnginePort,
  type Layer,
} from "@musart/core";
import type { TextInsertionMode } from "../../state/session/text-insertion";
import type { Point } from "../viewport/view";
import { publishEditorNotice } from "../../components/notifications/source";
import { i18n } from "../../state/i18n";
import "../../components/notifications/messages";

export function createTextDrawing(point: Point, text: string, mode: TextInsertionMode): Layer {
  return createLayer("text", {
    x: point.x,
    y: point.y,
    width: 1,
    height: 1,
    text,
    name: text,
    fontSize: 48,
    fill: "#202024",
    ...(mode === "3d"
      ? { spatial: { ...createSpatialLayer("extrude"), depth: 0.12, bevel: 0.01 } }
      : {}),
  });
}

/** Scene initialization and the source are one validated, undoable edit. */
export function commitDrawing(engine: EnginePort, layer: Layer) {
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const scene = layer.spatial && !page.spatial ? createSpatialScene() : undefined;
  if (scene) for (const light of scene.lights) light.id = crypto.randomUUID();
  engine.transaction([
    { type: "addLayers", layers: [layer] },
    ...(scene ? [{ type: "updatePage" as const, patch: { spatial: scene } }] : []),
  ]);
  engine.select([layer.id]);
  if (layer.kind === "text")
    publishEditorNotice(engine, {
      message: i18n.t("objectAdded", { ns: "notices", name: layer.name }),
      error: false,
    });
}
