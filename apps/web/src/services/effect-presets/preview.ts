import {
  createLayerGeometryIndex,
  getEffectDefinition,
  instantiateEffectTreatment,
} from "@musart/core";
import type { EffectTreatment, SessionSnapshot } from "@musart/core";
import type { PreviewValue } from "../../state/session/preview-source";
import { ownerHasDepth } from "../../components/layers/catalog/model";

/** Transient originals belong to this preview only; no assets or commands enter the document. */
export function effectPresetPreview(
  snapshot: SessionSnapshot,
  effectId: string,
  layerId: string | undefined,
  treatment: EffectTreatment,
): PreviewValue {
  const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
  const layer = layerId ? page.layers.find((layer) => layer.id === layerId) : undefined;
  if (layerId && (!layer || createLayerGeometryIndex(page).isLocked(layerId))) throw Error("stale");
  const previous = layer?.effects ?? page.effects ?? [];
  const effect = previous.find((effect) => effect.id === effectId);
  if (
    !effect ||
    treatment.kind !== "effect" ||
    treatment.effects.length !== 1 ||
    treatment.effects[0]!.type !== effect.type
  )
    throw Error("stale");
  const definition = getEffectDefinition(effect.type);
  if (
    definition.retired ||
    (layer && definition.requirements?.scope === "composition") ||
    (definition.requirements?.depth && !ownerHasDepth(page, layerId))
  )
    throw Error("Treatment requires a compatible owner with native depth");
  const copy = instantiateEffectTreatment(treatment, () => crypto.randomUUID());
  const effects = previous.map((item) =>
    item.id === effectId ? { ...copy.effects[0]!, id: effectId } : item,
  );
  const assets = copy.assets.length
    ? { assets: Object.fromEntries(copy.assets.map((asset) => [asset.id, asset])) }
    : {};
  return layer
    ? { target: "layer", layerId: layer.id, patch: { effects }, ...assets }
    : { target: "page", patch: { effects }, ...assets };
}
