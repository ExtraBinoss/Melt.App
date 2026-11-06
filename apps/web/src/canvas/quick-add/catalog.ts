import type { SessionSnapshot } from "@musart/core";
import { createSearchCommandItems } from "../../components/search/catalog/items";
import type { SearchAction, SearchTranslate } from "../../components/search/catalog/model";
import type { BindingSnapshot } from "../../state/keybindings/model";
import { isCommandId } from "../../state/keybindings/registry";
import { keybindings } from "../../state/keybindings/store";
import type { SearchCatalog } from "../../components/search/catalog/cache";
import type { SearchItem } from "../../components/search/catalog/model";

const ordered = new WeakMap<readonly SearchItem[], SearchItem[]>();

const ADDABLE = new Set<SearchAction>([
  "importImages",
  "importSvg",
  "toolText",
  "toolShape",
  "toolRectangle",
  "toolEllipse",
  "addPage",
  "addTechnoArtboard",
]);

/** Shared registered commands, with direct insertion actions first in the blank-canvas menu. */
export function createQuickAddItems(
  snapshot: SessionSnapshot,
  t: SearchTranslate,
  bindings?: BindingSnapshot,
  shared?: { catalog: SearchCatalog; locale: string },
) {
  const commands = shared
    ? shared.catalog.commandsFor(snapshot, t, bindings ?? keybindings.readSnapshot(), shared.locale)
    : createSearchCommandItems(snapshot, t, bindings);
  const cached = ordered.get(commands);
  if (cached) return cached;
  const items = commands.filter((item) => isCommandId(item.id));
  const addable = (item: (typeof items)[number]) =>
    item.target.kind === "action" && ADDABLE.has(item.target.action);
  const result = [...items.filter(addable), ...items.filter((item) => !addable(item))];
  ordered.set(commands, result);
  return result;
}
