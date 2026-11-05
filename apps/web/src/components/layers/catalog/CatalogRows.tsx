import {
  memo,
  useMemo,
  useRef,
  useState,
  useImperativeHandle,
  type Ref,
  type FocusEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { EffectType } from "@musart/core";
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel } from "../../ui/dropdown-menu";
import { useVirtualList } from "../../shared/scroll/use-virtual-list";
import { EffectThumbnail } from "./EffectThumbnail";
import { catalogRows, CATALOG_PADDING, CATALOG_ROW_HEIGHT } from "./rows";
import { useCatalogNavigation } from "./use-catalog-navigation";
import type { CatalogEntry, EffectFamily } from "./model";

export interface CatalogRowsHandle {
  focusFirst(): void;
}

/** Only a viewport and a small overscan mount Radix controllers; full catalog navigation is retained. */
export function CatalogRows({
  entries,
  families,
  empty,
  onAdd,
  ref,
}: {
  ref?: Ref<CatalogRowsHandle>;
  entries: readonly CatalogEntry[];
  families: readonly EffectFamily[];
  empty: string;
  onAdd(this: void, type: EffectType): void;
}) {
  const { t } = useTranslation();
  const viewport = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const layout = useMemo(() => catalogRows(entries, families), [entries, families]);
  const { first, last, attachViewport, onScroll } = useVirtualList(
    layout.count,
    CATALOG_ROW_HEIGHT,
    viewport,
    3,
  );
  const { key, focus: focusEntry } = useCatalogNavigation(
    layout.entries,
    layout.positions,
    viewport,
    onScroll,
    first,
    last,
  );
  useImperativeHandle(ref, () => ({ focusFirst: () => focusEntry(0) }), [focusEntry]);
  const visible = (row: number) => row >= first && row < last;
  const height = layout.count * CATALOG_ROW_HEIGHT + CATALOG_PADDING * 2;
  function focus(event: FocusEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-effect-catalog-item]");
    if (target) setFocused(target.dataset.effectCatalogItem ?? null);
  }
  return (
    <div
      ref={attachViewport}
      className="effect-catalog-viewport"
      style={{ height: layout.count ? Math.min(350, height) : undefined }}
      onKeyDownCapture={key}
      onFocusCapture={focus}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null);
      }}
    >
      {!!layout.count && (
        <div className="effect-catalog-virtual" style={{ height }}>
          {layout.groups.map((group) => {
            const items = group.items.filter(
              (item) => visible(item.row) || item.entry.type === focused,
            );
            if (!items.length && !visible(group.heading)) return null;
            const label = t(`effectCatalog:family.${group.family}`);
            return (
              <DropdownMenuGroup key={group.family} aria-label={label}>
                {visible(group.heading) && (
                  <DropdownMenuLabel
                    style={{
                      top: CATALOG_PADDING + group.heading * CATALOG_ROW_HEIGHT,
                    }}
                  >
                    {label}
                  </DropdownMenuLabel>
                )}
                {items.map((item) => (
                  <CatalogItem
                    key={item.entry.type}
                    entry={item.entry}
                    top={CATALOG_PADDING + item.row * CATALOG_ROW_HEIGHT}
                    index={item.index}
                    count={entries.length}
                    onAdd={onAdd}
                  />
                ))}
              </DropdownMenuGroup>
            );
          })}
        </div>
      )}
      {!entries.length && (
        <p className="effect-catalog-empty" role="status">
          {empty}
        </p>
      )}
    </div>
  );
}

const CatalogItem = memo(function CatalogItem({
  entry,
  top,
  index,
  count,
  onAdd,
}: {
  entry: CatalogEntry;
  top: number;
  index: number;
  count: number;
  onAdd(this: void, type: EffectType): void;
}) {
  return (
    <DropdownMenuItem
      textValue={entry.label}
      data-effect-catalog-item={entry.type}
      style={{ top }}
      aria-setsize={count}
      aria-posinset={index + 1}
      onSelect={() => onAdd(entry.type)}
    >
      <EffectThumbnail type={entry.type} />
      <span className="effect-catalog-item-label">{entry.label}</span>
    </DropdownMenuItem>
  );
});
