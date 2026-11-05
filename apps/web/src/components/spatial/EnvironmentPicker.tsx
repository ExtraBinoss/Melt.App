import { useTranslation } from "react-i18next";
import { SPATIAL_ENVIRONMENT_PRESETS, SPATIAL_ENVIRONMENT_CATEGORIES } from "@musart/core";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { CatalogGroups } from "../../ui/studio/catalog/CatalogGroups";
import { CatalogSwatch } from "../../ui/studio/catalog/CatalogSwatch";
import { useCatalogNames } from "../../ui/studio/catalog/names";
import { useCatalogPreview } from "./use-catalog-preview";
import "./messages";

export function EnvironmentPicker({
  value,
  assetName,
  onChoose,
  onPreview,
  onCancel,
  identity,
  disabled,
  embedded = false,
}: {
  value: string;
  assetName?: string;
  onChoose: (id: string) => void;
  onPreview?: (id: string) => void;
  onCancel?: () => void;
  identity?: unknown;
  disabled?: boolean;
  embedded?: boolean;
}) {
  const { t } = useTranslation("spatial");
  const { environmentName, categoryName } = useCatalogNames();
  const session = useCatalogPreview({ identity, disabled, onChoose, onPreview, onCancel });
  const index = SPATIAL_ENVIRONMENT_PRESETS.findIndex((item) => item.id === value);
  const groups = SPATIAL_ENVIRONMENT_CATEGORIES.map(({ id }) => ({
    id,
    label: categoryName("environment", id),
    count: SPATIAL_ENVIRONMENT_PRESETS.filter((item) => item.category === id).length,
  }));
  const catalog = (
    <ScrollShadow className="studio-catalog-scroll">
      <CatalogGroups kind="environment" groups={groups}>
        {(category) =>
          SPATIAL_ENVIRONMENT_PRESETS.map((preset, index) =>
            preset.category === category ? (
              <button
                type="button"
                key={preset.id}
                data-catalog-preset={preset.id}
                disabled={disabled}
                aria-label={environmentName(preset.id)}
                aria-pressed={!assetName && value === preset.id}
                onPointerEnter={() => session.preview(preset.id)}
                onFocus={() => session.preview(preset.id)}
                onClick={(event) => {
                  if (event.button === 0) session.choose(preset.id);
                }}
              >
                <CatalogSwatch kind="environments" index={index} />
                <span>{environmentName(preset.id)}</span>
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
          {index >= 0 && <CatalogSwatch kind="environments" index={index} />}
          <span>{assetName ?? environmentName(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="studio-surface studio-catalog-popover"
        aria-label={t("environment")}
        initialFocus="content"
        data-canvas-control
      >
        {catalog}
      </PopoverContent>
    </Popover>
  );
}
