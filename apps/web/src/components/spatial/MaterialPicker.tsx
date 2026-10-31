import { useTranslation } from "react-i18next";
import { SPATIAL_MATERIALS } from "@musart/core";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { Button } from "../ui/button";
import "./messages";
import "./spatial.css";
export function MaterialPicker({
  value,
  onChoose,
  disabled,
}: {
  value: string;
  onChoose: (id: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("spatial");
  const material = SPATIAL_MATERIALS.findIndex((item) => item.id === value);
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button disabled={disabled} variant="outline" className="spatial-material-trigger">
          <MaterialSwatch index={Math.max(0, material)} />
          {t(`materialNames.${value}`)}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="spatial-material-popover"
        aria-label={t("materials")}
      >
        <ScrollShadow className="spatial-preset-scroll">
          <div className="spatial-material-grid" role="group" aria-label={t("materials")}>
            {SPATIAL_MATERIALS.map((preset, index) => (
              <button
                type="button"
                key={preset.id}
                aria-label={t(`materialNames.${preset.id}`)}
                aria-pressed={value === preset.id}
                onClick={() => onChoose(preset.id)}
              >
                <MaterialSwatch index={index} />
                <span>{t(`materialNames.${preset.id}`)}</span>
              </button>
            ))}
          </div>
        </ScrollShadow>
      </PopoverContent>
    </Popover>
  );
}
export function MaterialSwatch({ index }: { index: number }) {
  return (
    <span
      aria-hidden
      className="spatial-material-swatch"
      style={{
        backgroundImage: `url(${import.meta.env.BASE_URL}spatial/materials.png)`,
        backgroundPosition: `${(index % 5) * 25}% ${Math.floor(index / 5) * 20}%`,
      }}
    />
  );
}
