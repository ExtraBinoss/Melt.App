import type { Composition, Effect, Layer, Project } from "../document/model";
import type { ColorTarget } from "./model";
import { ensure } from "../errors";
import { getEffectDefinition } from "../effects/catalog";
export type ColorOwner = Composition | Layer | Effect;
export function replaceColorLinks(owner: ColorOwner, links: Record<string, string>): void {
  if (Object.keys(links).length) owner.colorLinks = links;
  else delete owner.colorLinks;
}
export function colorOwner(project: Project, target: ColorTarget): ColorOwner {
  const page = project.pages.find((item) => item.id === target.pageId);
  ensure(page, "NOT_FOUND", "Color composition is missing");
  const layer = target.layerId ? page.layers.find((item) => item.id === target.layerId) : undefined;
  ensure(!target.layerId || layer, "NOT_FOUND", "Color layer is missing");
  if (target.effectId) {
    const effect = (layer?.effects ?? page.effects)?.find((item) => item.id === target.effectId);
    ensure(effect, "NOT_FOUND", "Color effect is missing");
    ensure(
      getEffectDefinition(effect.type).parameters.some(
        (parameter) =>
          parameter.kind === "color" &&
          parameter.scope === "settings" &&
          parameter.key === target.property,
      ),
      "INVALID_COMMAND",
      "Unknown effect color",
    );
    return effect;
  }
  ensure(
    layer ? ["fill", "stroke"].includes(target.property) : target.property === "background",
    "INVALID_COMMAND",
    "Unknown color property",
  );
  return layer ?? page;
}
export function readTargetColor(owner: ColorOwner, property: string): string | undefined {
  return "type" in owner
    ? (owner.settings?.[property] as string | undefined)
    : (owner as unknown as Record<string, string>)[property];
}
export function writeTargetColor(owner: ColorOwner, property: string, value: string): void {
  if ("type" in owner) owner.settings = { ...owner.settings, [property]: value };
  else Object.assign(owner, { [property]: value });
}
export function colorTargets(
  project: Project,
): { target: ColorTarget; owner: ColorOwner; colorId: string }[] {
  const result: ReturnType<typeof colorTargets> = [];
  const collect = (owner: ColorOwner, address: Omit<ColorTarget, "property">) => {
    for (const [property, colorId] of Object.entries(owner.colorLinks ?? {}))
      result.push({ target: { ...address, property }, owner, colorId });
  };
  for (const page of project.pages) {
    collect(page, { pageId: page.id });
    for (const effect of page.effects ?? [])
      collect(effect, { pageId: page.id, effectId: effect.id });
    for (const layer of page.layers) {
      collect(layer, { pageId: page.id, layerId: layer.id });
      for (const effect of layer.effects)
        collect(effect, { pageId: page.id, layerId: layer.id, effectId: effect.id });
    }
  }
  return result;
}
/** Local literal edits detach their changed fields without touching other graph owners. */
export function detachChangedColorLinks(owner: ColorOwner, patch: Record<string, unknown>): void {
  if (!owner.colorLinks) return;
  const links = { ...owner.colorLinks };
  for (const property of Object.keys(links))
    if (Object.hasOwn(patch, property) && patch[property] !== readTargetColor(owner, property))
      delete links[property];
  replaceColorLinks(owner, links);
}
/** Replacing effect settings locally detaches only changed linked colors. */
export function detachEditedEffects(
  previous: readonly Effect[],
  next: readonly Effect[],
): Effect[] {
  return next.map((effect) => {
    const before = previous.find((item) => item.id === effect.id);
    if (!before || !effect.colorLinks) return effect;
    const links = { ...effect.colorLinks };
    for (const key of Object.keys(links))
      if (effect.settings?.[key] !== before.settings?.[key]) delete links[key];
    const next = { ...effect };
    replaceColorLinks(next, links);
    return next;
  });
}
