import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "motion/react";
import type { EnginePort } from "@musart/core";
import { Button } from "../../components/ui/button";
import { ButtonGroup } from "../../components/ui/button-group";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../../components/ui/command";
import { PaletteReveal } from "../../components/shared/motion/PaletteReveal";
import { usePaletteInteraction } from "../../components/shared/motion/PalettePanel";
import { Kbd, KbdGroup } from "../../components/ui/kbd";
import { HorizontalScroll } from "../../components/shared/scroll/HorizontalScroll";
import {
  SEARCH_CATEGORIES,
  type SearchFilter,
  type SearchItem,
  type SearchTranslate,
} from "../../components/search/catalog/model";
import { searchItems } from "../../components/search/catalog/search";
import { getSearchIcon } from "../../components/search/icons";
import { modifierLabel } from "../../components/search/shortcuts";
import { useSearchPlaceholder } from "../../components/search/use-search-placeholder";
import { useKeybindings } from "../../state/keybindings/use-keybindings";
import { createQuickAddItems } from "./catalog";
import type { SearchCatalog } from "../../components/search/catalog/cache";

const alreadyRanked = () => 1;

/** Only the mounted menu owns query, typewriter and row presentation. */
export function QuickAddMenu({
  engine,
  catalog,
  translate: t,
  onChoose,
}: {
  engine: EnginePort;
  catalog: SearchCatalog;
  translate: SearchTranslate;
  onChoose: (item: SearchItem) => void;
}) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const bindings = useKeybindings();
  const reduced = Boolean(useReducedMotion());
  const interact = usePaletteInteraction();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<SearchFilter>("all");
  const items = useMemo(
    () => createQuickAddItems(engine.getSnapshot(), t, bindings, { catalog, locale }),
    [engine, t, bindings, catalog, locale],
  );
  const results = useMemo(() => searchItems(items, query, category), [items, query, category]);
  useSearchPlaceholder(input, items, t("search:searchPrefix"), reduced);
  let order = 2;
  return (
    <div className="quick-add-surface" data-reduced-motion={reduced || undefined}>
      <Command label={t("quickAdd:title")} shouldFilter={false} filter={alreadyRanked} loop>
        <PaletteReveal asChild order={0}>
          <div>
            <CommandInput
              ref={input}
              aria-label={t("quickAdd:title")}
              placeholder={t("quickAdd:search")}
              value={query}
              onValueChange={(value) => {
                interact();
                setQuery(value);
              }}
            />
          </div>
        </PaletteReveal>
        <PaletteReveal asChild order={1}>
          <div>
            <HorizontalScroll
              label={t("search:categories")}
              className="quick-add-category-scroll"
              edgeControls="shadows"
            >
              <ButtonGroup className="quick-add-categories" aria-label={t("search:categories")}>
                {(
                  [
                    "all",
                    ...SEARCH_CATEGORIES.filter((value) =>
                      items.some((item) => item.category === value),
                    ),
                  ] as const
                ).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={category === value ? "secondary" : "ghost"}
                    aria-pressed={category === value}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
                    }}
                    onClick={() => {
                      interact();
                      setCategory(value);
                      input.current?.focus({ preventScroll: true });
                    }}
                  >
                    {t(`search:${value}`)}
                  </Button>
                ))}
              </ButtonGroup>
            </HorizontalScroll>
          </div>
        </PaletteReveal>
        <CommandList
          data-search-query={query}
          data-search-category={category}
          data-search-pending="false"
          data-search-result-count={results.total}
        >
          <CommandEmpty>{t("quickAdd:empty")}</CommandEmpty>
          {[...new Set(results.items.map((item) => item.category))].map((value) => (
            <CommandGroup
              key={value}
              heading={<PaletteReveal order={order++}>{t(`search:${value}`)}</PaletteReveal>}
            >
              {results.items
                .filter((item) => item.category === value)
                .map((item) => {
                  const Icon = getSearchIcon(item);
                  return (
                    <PaletteReveal
                      key={item.id}

                      asChild
                      order={order++}
                    >
                      <CommandItem
                        value={item.id}
                        disabled={Boolean(item.disabled)}
                        aria-label={item.label}
                        aria-description={item.disabled}
                        onSelect={() => onChoose(item)}
                      >
                        <Icon size={15} />
                        <span className="quick-add-item-label">
                          <span>{item.label}</span>
                          {item.disabled && <small>{item.disabled}</small>}
                        </span>
                        {item.shortcut?.length ? (
                          <KbdGroup>
                            {item.shortcut.map((key) => (
                              <Kbd key={key}>{key === "Mod" ? modifierLabel() : key}</Kbd>
                            ))}
                          </KbdGroup>
                        ) : null}
                      </CommandItem>
                    </PaletteReveal>
                  );
                })}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
