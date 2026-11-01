import type { Asset, Effect } from "../document/model";
import { isImageAsset } from "../assets/identity";
import { assertRecord, assertText } from "../document/guards";
import { getEffectDefinition } from "./catalog";
import { ensure } from "../errors";
export function effectAssetIds(effects: readonly Effect[]): string[] {
  return [...new Set(effects.flatMap((effect) => Object.values(effect.inputs ?? {})))];
}
export function validateEffectInputs(
  effect: Effect,
  assets?: Readonly<Record<string, Asset>>,
): void {
  if (effect.inputs === undefined) return;
  assertRecord(effect.inputs);
  const definitions = getEffectDefinition(effect.type).inputs ?? [];
  ensure(
    Object.keys(effect.inputs).length <= definitions.length,
    "INVALID_DOCUMENT",
    "Too many effect inputs",
  );
  for (const [key, id] of Object.entries(effect.inputs)) {
    ensure(
      definitions.some((input) => input.key === key),
      "INVALID_DOCUMENT",
      "Unknown effect input",
    );
    assertText(id, 256);
    if (assets)
      ensure(
        Object.hasOwn(assets, id) && isImageAsset(assets[id]!),
        "INVALID_DOCUMENT",
        "Effect input requires a project image",
      );
  }
}
