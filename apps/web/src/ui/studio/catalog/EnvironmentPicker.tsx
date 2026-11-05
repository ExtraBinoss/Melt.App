import { useTranslation } from "react-i18next";
import { SPATIAL_ENVIRONMENT_PRESETS, SPATIAL_ENVIRONMENT_CATEGORIES } from "@musart/core";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Button } from "../../../components/ui/button";
import { ScrollShadow } from "../../../components/shared/scroll/ScrollShadow";
import { CatalogGroups } from "./CatalogGroups";
import { CatalogSwatch } from "./CatalogSwatch";
import { useCatalogNames } from "./names";

export function EnvironmentPicker({
  value,
  assetName,
  onChoose,
  embedded = false,
}: {
  value: string;
  assetName?: string;
  onChoose: (id: string) => void;
  embedded?: boolean;
}) {
  const { t } = useTranslation("spatial");
  const { environmentName, categoryName } = useCatalogNames();
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
                aria-label={environmentName(preset.id)}
                aria-pressed={!assetName && value === preset.id}
                onClick={() => onChoose(preset.id)}
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
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="studio-catalog-trigger">
          {index >= 0 && <CatalogSwatch kind="environments" index={index} />}
          <span>{assetName ?? environmentName(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="studio-surface studio-catalog-popover"
        aria-label={t("environment")}
        data-canvas-control
      >
        {catalog}
      </PopoverContent>
    </Popover>
  );
}
