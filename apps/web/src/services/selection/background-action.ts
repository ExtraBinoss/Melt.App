import {
  createLayerGeometryIndex,
  isImageAsset,
  isVideoAsset,
  type EnginePort,
  type SessionSnapshot,
} from "@musart/core";
import type { ObjectSelectionPort } from "./object/model";
import { createMotionTransport } from "../motion/transport";
import { i18n } from "../../state/i18n";
export function backgroundImage(snapshot: SessionSnapshot): string | undefined {
  if (snapshot.selection.length !== 1) return;
  const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId);
  if (!page) return;
  const geometry = createLayerGeometryIndex(page),
    layer = geometry.byId.get(snapshot.selection[0]!);
  const asset = layer?.assetId ? snapshot.project.assets[layer.assetId] : undefined;
  if (
    (layer?.kind === "image" || layer?.kind === "video") &&
    !layer.spatial &&
    !layer.maskSource &&
    asset &&
    (isImageAsset(asset) || isVideoAsset(asset)) &&
    geometry.isVisible(layer.id) &&
    !geometry.isLocked(layer.id)
  )
    return layer.id;
}
/** Buttons, search and shortcuts invoke the same explicit, undoable action. */
export async function removeSelectedBackground(engine: EnginePort, objects?: ObjectSelectionPort) {
  const id = backgroundImage(engine.getSnapshot());
  if (!id || !objects) throw Error(i18n.t("pixelSelection:selectMediaFirst"));
  const transport = createMotionTransport(engine);
  if (transport.read().playing) transport.pause();
  try {
    await objects.removeBackground(id);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
  }
}
