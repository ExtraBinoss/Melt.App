import {
  createLayerGeometryIndex,
  getEffectDefinition,
  instantiateEffectTreatment,
  validateEffectTreatment,
  type Command,
  type EffectTreatment,
  type EnginePort,
  type SessionSnapshot,
} from "@musart/core";
import { ownerHasDepth } from "../../components/layers/catalog/model";
export interface TreatmentTarget {
  pageId: string;
  layerIds?: readonly string[];
  effectId?: string;
}
/** A single transaction owns imported originals, ordered effects and undo/redo. */
export function applyTreatment(
  engine: EnginePort,
  origin: SessionSnapshot,
  target: TreatmentTarget,
  treatment: EffectTreatment,
  mode: "append" | "replace",
) {
  validateEffectTreatment(treatment);
  const snapshot = engine.getSnapshot();
  if (
    snapshot.project !== origin.project ||
    snapshot.pageId !== origin.pageId ||
    snapshot.selection !== origin.selection
  )
    throw Error("stale");
  const page = snapshot.project.pages.find((page) => page.id === target.pageId);
  if (!page || page.id !== snapshot.pageId) throw Error("stale");
  const geometry = createLayerGeometryIndex(page);
  const ids = target.layerIds ?? [undefined];
  if (!ids.length || new Set(ids).size !== ids.length || ids.some((id) => id !== undefined && !id))
    throw Error("stale");
  const commands: Command[] = [];
  for (const id of ids) {
    const layer = id ? page.layers.find((layer) => layer.id === id) : undefined;
    if (id && (!layer || geometry.isLocked(id))) throw Error("stale");
    for (const effect of treatment.effects) {
      const requirements = getEffectDefinition(effect.type).requirements;
      if (
        getEffectDefinition(effect.type).retired ||
        (id && requirements?.scope === "composition") ||
        (requirements?.depth && !ownerHasDepth(page, id))
      )
        throw Error("Treatment requires a compatible owner with native depth");
    }
    const copy = instantiateEffectTreatment(treatment, () => crypto.randomUUID());
    const previous = layer?.effects ?? page.effects ?? [];
    let effects = mode === "append" ? [...previous, ...copy.effects] : copy.effects;
    if (target.effectId) {
      if (
        copy.effects.length !== 1 ||
        !previous.some(
          (effect) => effect.id === target.effectId && effect.type === copy.effects[0]!.type,
        )
      )
        throw Error("stale");
      effects = previous.map((effect) =>
        effect.id === target.effectId ? { ...copy.effects[0]!, id: effect.id } : effect,
      );
    }
    if (effects.length > 64) throw Error("A stack can contain at most 64 effects");
    if (copy.assets.length) commands.push({ type: "addAssets", assets: copy.assets });
    if (layer) commands.push({ type: "updateLayers", ids: [layer.id], patch: { effects } });
    else commands.push({ type: "updatePage", patch: { effects } });
  }
  engine.transaction(commands);
}
