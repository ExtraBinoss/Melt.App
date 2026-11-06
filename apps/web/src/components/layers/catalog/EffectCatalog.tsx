import { memo, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { EffectType } from "@musart/core";
import { CatalogRows, type CatalogRowsHandle } from "./CatalogRows";
import { SearchInput } from "../../assets/SearchInput";
import { SelectField } from "../../shared/SelectField";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import {
  EFFECT_FAMILIES,
  effectCatalogEntries,
  filterEffectCatalog,
  type EffectCategory,
  type EffectFamily,
  type EffectCatalogOwner,
} from "./model";
import "./messages";
import "../../properties/effects/library-messages";
import "../../motion/transitions/messages";
import "./catalog.css";

/** Shared mounted-only menu leaf. Browsing never mutates the document or previews effects. */
export const EffectCatalog = memo(function EffectCatalog({
  category,
  onAdd,
  initialQuery = "",
  owner = { scope: "layer" },
}: {
  category: EffectCategory;
  initialQuery?: string;
  owner?: EffectCatalogOwner;
  onAdd(this: void, type: EffectType): void;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [family, setFamily] = useState<EffectFamily | "all">("all");
  const list = useRef<CatalogRowsHandle>(null);
  const entries = useMemo(
    () => effectCatalogEntries(category, t, i18n.resolvedLanguage ?? i18n.language, owner),
    [category, t, i18n.resolvedLanguage, i18n.language, owner.scope, owner.depthAvailable],
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
      list.current?.focusFirst();
    }
  }
  return (
    <div className="effect-catalog" data-effect-category={category}>
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
          prewarm={false}
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
        <CatalogRows
          key={JSON.stringify([category, query, family])}
          ref={list}
          entries={visible}
          families={families}
          onAdd={onAdd}
          empty={t(category === "effect" ? "effectCatalog:empty" : "effectCatalog:emptyAdjustment")}
        />
      </ScrollShadow>
    </div>
  );
});
