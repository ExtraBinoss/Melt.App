import type { Asset, Effect, ImageAsset } from "../document/model";
import { cloneValue } from "../document/immutable";
import { validateEffect } from "../document/validation";
import { assertList, assertRecord, assertText, assertUniqueId } from "../document/guards";
import { validateAssetDescription } from "../assets/validation";
import { isImageAsset } from "../assets/identity";
import { validateEffectInputs } from "./inputs";
import { ensure } from "../errors";
import { getEffectDefinition } from "./catalog";
import { resolveEffectSettings } from "./settings";

export interface EffectTreatment {
  id: string;
  name: string;
  kind: "effect" | "stack";
  effects: Effect[];
  assets: Record<string, ImageAsset>;
}
/** Generated depth and source-owned paint/geometry never travel to another owner. */
export function reusableEffect(effect: Effect): Effect {
  const next = cloneValue(effect);
  delete next.preset;
  delete next.colorLinks;
  delete next.liquify;
  delete next.shapeMorph;
  if (next.type === "depth-anything") delete next.inputs;
  return next;
}
export function captureEffectTreatment(
  id: string,
  name: string,
  effects: readonly Effect[],
  assets: Readonly<Record<string, Asset>>,
  kind: EffectTreatment["kind"],
): EffectTreatment {
  const copied = effects.map(reusableEffect);
  const originals: Record<string, ImageAsset> = {};
  for (const effect of copied) {
    validateEffectInputs(effect, assets);
    for (const input of Object.values(effect.inputs ?? {})) {
      const asset = assets[input];
      ensure(
        asset && isImageAsset(asset),
        "INVALID_DOCUMENT",
        "Reusable treatments require embedded image inputs; external media cannot be saved.",
      );
      originals[input] = cloneValue(asset);
    }
  }
  const result = { id, name: name.trim(), kind, effects: copied, assets: originals };
  validateEffectTreatment(result);
  return result;
}
export function validateEffectTreatment(value: unknown): asserts value is EffectTreatment {
  assertRecord(value);
  assertText(value.id, 256);
  assertText(value.name, 120);
  ensure(value.name.trim() === value.name, "INVALID_DOCUMENT", "Invalid treatment name");
  ensure(
    value.kind === "effect" || value.kind === "stack",
    "INVALID_DOCUMENT",
    "Invalid treatment kind",
  );
  assertList(value.effects, 64);
  ensure(
    value.effects.length > 0 && (value.kind !== "effect" || value.effects.length === 1),
    "INVALID_DOCUMENT",
    "Invalid treatment stack",
  );
  assertRecord(value.assets);
  ensure(Object.keys(value.assets).length <= 128, "INVALID_DOCUMENT", "Too many treatment assets");
  const ids = new Set<string>();
  for (const [id, asset] of Object.entries(value.assets)) {
    assertUniqueId(id, ids);
    assertRecord(asset);
    ensure(
      asset.id === id && isImageAsset(asset as unknown as Asset),
      "INVALID_DOCUMENT",
      "Invalid treatment image",
    );
    validateAssetDescription(asset);
  }
  for (const effect of value.effects) {
    validateEffect(effect, ids);
    const item = effect as Effect;
    ensure(
      item.colorLinks === undefined && item.preset === undefined,
      "INVALID_DOCUMENT",
      "Treatment contains project-local references",
    );
    ensure(
      !item.liquify &&
        !item.shapeMorph &&
        !(item.type === "depth-anything" && item.inputs && Object.keys(item.inputs).length),
      "INVALID_DOCUMENT",
      "Treatment contains source-owned data",
    );
    validateEffectInputs(item, value.assets as Record<string, Asset>);
  }
}
/** New identities and nested copies make each application independent of the library and siblings. */
export function instantiateEffectTreatment(
  value: EffectTreatment,
  allocate: () => string,
): { effects: Effect[]; assets: ImageAsset[] } {
  validateEffectTreatment(value);
  const mapping = new Map(Object.keys(value.assets).map((id) => [id, allocate()]));
  const assets = Object.entries(value.assets).map(([id, asset]) => ({
    ...cloneValue(asset),
    id: mapping.get(id)!,
  }));
  const effects = value.effects.map((effect) => ({
    ...cloneValue(effect),
    id: allocate(),
    ...(effect.inputs
      ? {
          inputs: Object.fromEntries(
            Object.entries(effect.inputs).map(([key, id]) => [key, mapping.get(id)!]),
          ),
        }
      : {}),
    ...(value.kind === "effect" ? { preset: { id: value.id, name: value.name } } : {}),
  }));
  return { effects, assets };
}
export function effectMatchesTreatment(
  effect: Effect,
  treatment: EffectTreatment,
  assets?: Readonly<Record<string, Asset>>,
): boolean {
  function normalized(item: Effect, originals?: Readonly<Record<string, Asset>>) {
    const copy = reusableEffect(item);
    return canonical({
      ...getEffectDefinition(copy.type).defaults,
      ...copy,
      id: "",
      settings: resolveEffectSettings(copy),
      opacity: copy.opacity ?? 1,
      blendMode: copy.blendMode ?? "normal",
      composite: copy.composite ?? "source-over",
      time: copy.time ?? 0,
      inputs: copy.inputs
        ? Object.fromEntries(
            Object.entries(copy.inputs).map(([key, id]) => [
              key,
              originals?.[id] ? { ...originals[id], id: "" } : id,
            ]),
          )
        : undefined,
    });
  }
  return (
    treatment.kind === "effect" &&
    normalized(effect, assets) === normalized(treatment.effects[0]!, treatment.assets)
  );
}
function canonical(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value))
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value)
          .filter(([, value]) => value !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [key, JSON.parse(canonical(value))]),
      ),
    );
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(canonical(item))));
  return JSON.stringify(value) ?? "null";
}
