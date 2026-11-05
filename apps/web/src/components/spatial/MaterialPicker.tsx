import { useTranslation } from "react-i18next";
import { SPATIAL_MATERIALS, SPATIAL_MATERIAL_CATEGORIES } from "@musart/core";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { Button } from "../ui/button";
import { CatalogGroups } from "../../ui/studio/catalog/CatalogGroups";
import { CatalogSwatch } from "../../ui/studio/catalog/CatalogSwatch";
import { useCatalogNames } from "../../ui/studio/catalog/names";
import { useCatalogPreview } from "./use-catalog-preview";
import "./messages";
import "./spatial.css";

export function MaterialPicker({
  value,
  onChoose,
  onPreview,
  onCancel,
  identity,
  disabled,
  embedded = false,
}: {
  value: string;
  onChoose: (id: string) => void;
  onPreview?: (id: string) => void;
  onCancel?: () => void;
  identity?: unknown;
  disabled?: boolean;
  embedded?: boolean;
}) {
  const { t } = useTranslation("spatial");
  const { materialName, categoryName } = useCatalogNames();
  const session = useCatalogPreview({ identity, disabled, onChoose, onPreview, onCancel });
  const material = SPATIAL_MATERIALS.findIndex((item) => item.id === value);
  const groups = SPATIAL_MATERIAL_CATEGORIES.map(({ id }) => ({
    id,
    label: categoryName("material", id),
    count: SPATIAL_MATERIALS.filter((item) => item.category === id).length,
  }));
  const catalog = (
    <ScrollShadow className="studio-catalog-scroll">
      <CatalogGroups kind="material" groups={groups}>
        {(category) =>
          SPATIAL_MATERIALS.map((preset, index) =>
            preset.category === category ? (
              <button
                type="button"
                key={preset.id}
                data-catalog-preset={preset.id}
                disabled={disabled}
                aria-label={materialName(preset.id)}
                aria-pressed={value === preset.id}
                onPointerEnter={() => session.preview(preset.id)}
                onFocus={() => session.preview(preset.id)}
                onClick={(event) => {
                  if (event.button === 0) session.choose(preset.id);
                }}
              >
                <MaterialSwatch index={index} />
                <span>{materialName(preset.id)}</span>
              </button>
            ) : null,
          )
        }
      </CatalogGroups>
    </ScrollShadow>
  );
  if (embedded) return <div className="studio-catalog-embedded">{catalog}</div>;
  return (
    <Popover modal={false} onOpenChange={(open) => !open && session.cancel()}>
      <PopoverTrigger asChild>
        <Button disabled={disabled} variant="outline" className="studio-catalog-trigger">
          <MaterialSwatch index={Math.max(0, material)} />
          <span>{materialName(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="studio-surface studio-catalog-popover"
        aria-label={t("materials")}
        initialFocus="content"
        data-canvas-control
      >
        {catalog}
      </PopoverContent>
    </Popover>
  );
}

export function MaterialSwatch({ index }: { index: number }) {
  return <CatalogSwatch kind="materials" index={index} />;
}
