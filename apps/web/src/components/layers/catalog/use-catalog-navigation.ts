import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { normalizeEffectSearch, type CatalogEntry } from "./model";
import { CATALOG_PADDING, CATALOG_ROW_HEIGHT } from "./rows";

/** Native activation/dismissal stays in Radix; navigation addresses the complete virtual catalog. */
export function useCatalogNavigation(
  entries: readonly CatalogEntry[],
  positions: ReadonlyMap<string, number>,
  viewportRef: RefObject<HTMLDivElement | null>,
  publishScroll: (event: { currentTarget: HTMLElement }) => void,
  first: number,
  last: number,
) {
  const pending = useRef<string | null>(null);
  const search = useRef({ text: "", at: 0 });
  const focusPending = useCallback(() => {
    const type = pending.current;
    const node =
      type &&
      [
        ...(viewportRef.current?.querySelectorAll<HTMLElement>("[data-effect-catalog-item]") ?? []),
      ].find((node) => node.dataset.effectCatalogItem === type);
    if (!node) return;
    pending.current = null;
    node.focus({ preventScroll: true });
  }, [viewportRef]);
  useLayoutEffect(focusPending, [first, last, entries, focusPending]);
  const focus = useCallback(
    (index: number) => {
      const entry = entries[index],
        node = viewportRef.current;
      if (!entry || !node) return;
      const row = positions.get(entry.type);
      if (row === undefined) return;
      const top = CATALOG_PADDING + row * CATALOG_ROW_HEIGHT;
      const current = node.scrollTop,
        height = node.clientHeight || 220;
      const next =
        top < current
          ? top
          : top + CATALOG_ROW_HEIGHT > current + height
            ? top + CATALOG_ROW_HEIGHT - height
            : current;
      pending.current = entry.type;
      if (next !== current) node.scrollTop = next;
      publishScroll({ currentTarget: node });
      focusPending();
    },
    [entries, positions, viewportRef, publishScroll, focusPending],
  );
  function key(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>("[data-effect-catalog-item]");
    if (!item || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing)
      return;
    const index = entries.findIndex((entry) => entry.type === item.dataset.effectCatalogItem);
    if (index < 0) return;
    const navigation: Record<string, number> = {
      ArrowDown: Math.min(entries.length - 1, index + 1),
      ArrowUp: Math.max(0, index - 1),
      Home: 0,
      PageUp: 0,
      End: entries.length - 1,
      PageDown: entries.length - 1,
    };
    if (Object.hasOwn(navigation, event.key)) {
      event.preventDefault();
      event.stopPropagation();
      focus(navigation[event.key]!);
      return;
    }
    if (event.key.length !== 1) return;
    const previous = event.timeStamp - search.current.at < 1000 ? search.current.text : "";
    if (event.key === " " && !previous) return;
    const text = previous + (event.key === " " ? " " : normalizeEffectSearch(event.key));
    search.current = { text, at: event.timeStamp };
    const query = /^(.)\1*$/u.exec(text)?.[1] ?? text;
    const start = index + (query.length === 1 ? 1 : 0);
    for (let offset = 0; offset < entries.length; offset++) {
      const next = (start + offset) % entries.length;
      if (!normalizeEffectSearch(entries[next]!.label).startsWith(query)) continue;
      event.preventDefault();
      event.stopPropagation();
      focus(next);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  return { key, focus };
}
