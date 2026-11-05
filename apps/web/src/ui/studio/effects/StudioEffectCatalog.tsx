import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EffectType } from "@musart/core";
import {
  effectCatalogEntries,
  filterEffectCatalog,
  type EffectCategory,
} from "../../../components/layers/catalog/model";
import { EffectThumbnail } from "../../../components/layers/catalog/EffectThumbnail";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import "../../../components/layers/catalog/messages";
import "../../../components/properties/effects/library-messages";

/** Use the established searchable catalog and effect taxonomy in a quiet popover surface. */
export function StudioEffectCatalog({
  category,
  disabled,
  onAdd,
}: {
  category: EffectCategory;
  disabled: boolean;
  onAdd: (type: EffectType) => void;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const entries = useMemo(
    () => effectCatalogEntries(category, t, i18n.resolvedLanguage ?? i18n.language),
    [category, t, i18n.resolvedLanguage, i18n.language],
  );
  const visible = filterEffectCatalog(entries, query, "all");
  return (
    <div className="studio-effect-catalog">
      <Input
        aria-label={t(
          category === "effect" ? "effectCatalog:search" : "effectCatalog:searchAdjustment",
        )}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <div className="studio-effect-options">
        {visible.map((entry) => (
          <Button
            key={entry.type}
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onAdd(entry.type)}
          >
            <EffectThumbnail type={entry.type} />
            <span>{entry.label}</span>
          </Button>
        ))}
        {!visible.length && <p className="muted-description">{t("effectCatalog:empty")}</p>}
      </div>
    </div>
  );
}
