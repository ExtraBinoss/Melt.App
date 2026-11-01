import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { EffectType } from "@musart/core";
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel } from "../../ui/dropdown-menu";
import { SearchInput } from "../../assets/SearchInput";
import { SelectField } from "../../shared/SelectField";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import {
  EFFECT_FAMILIES,
  effectCatalogEntries,
  filterEffectCatalog,
  type EffectCategory,
  type EffectFamily,
} from "./model";
import "./messages";
import "../../properties/effects/library-messages";
import "../../motion/transitions/messages";
import "./catalog.css";

/** Shared mounted-only menu leaf. Browsing never mutates the document or previews effects. */
export function EffectCatalog({
  category,
  onAdd,
}: {
  category: EffectCategory;
  onAdd(this: void, type: EffectType): void;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<EffectFamily | "all">("all");
  const root = useRef<HTMLDivElement>(null);
  const entries = useMemo(
    () => effectCatalogEntries(category, t, i18n.resolvedLanguage ?? i18n.language),
    [category, t, i18n.resolvedLanguage, i18n.language],
  );
  const families = EFFECT_FAMILIES.filter((family) =>
    entries.some((entry) => entry.family === family),
  );
  const visible = filterEffectCatalog(entries, query, family);
  const hints = useMemo(
    () =>
      entries
        .filter((entry) => family === "all" || entry.family === family)
        .map((entry) => ({ label: entry.label })),
    [entries, family],
  );
  function filterKeys(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      event.stopPropagation();
      return;
    }
    // Keep typing inside the filter instead of Radix menu typeahead. Escape still closes the menu.
    if (event.key === "Escape") return;
    event.stopPropagation();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      root.current?.querySelector<HTMLElement>("[data-effect-catalog-item]")?.focus();
    }
  }
  return (
    <div ref={root} className="effect-catalog" data-effect-category={category}>
      <div className="effect-catalog-filters">
        <SearchInput
          aria-label={t(
            category === "effect" ? "effectCatalog:search" : "effectCatalog:searchAdjustment",
          )}
          hints={hints}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={filterKeys}
        />
        <SelectField
          label={t("effectCatalog:familyLabel")}
          value={family}
          options={[
            { value: "all", label: t("effectCatalog:all") },
            ...families.map((value) => ({ value, label: t(`effectCatalog:family.${value}`) })),
          ]}
          onValueChange={(value) => setFamily(value as EffectFamily | "all")}
        />
      </div>
      <ScrollShadow className="effect-catalog-scroll" surface="var(--popover)">
        <div className="effect-catalog-viewport">
          {families.map((family) => {
            const items = visible.filter((entry) => entry.family === family);
            if (!items.length) return null;
            const label = t(`effectCatalog:family.${family}`);
            return (
              <DropdownMenuGroup key={family} aria-label={label}>
                <DropdownMenuLabel>{label}</DropdownMenuLabel>
                {items.map((entry) => (
                  <DropdownMenuItem
                    key={entry.type}
                    data-effect-catalog-item={entry.type}
                    onSelect={() => onAdd(entry.type)}
                  >
                    {entry.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            );
          })}
          {!visible.length && (
            <p className="effect-catalog-empty" role="status">
              {t(category === "effect" ? "effectCatalog:empty" : "effectCatalog:emptyAdjustment")}
            </p>
          )}
        </div>
      </ScrollShadow>
    </div>
  );
}
