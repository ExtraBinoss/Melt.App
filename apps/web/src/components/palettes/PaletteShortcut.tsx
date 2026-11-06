import { useState } from "react";
import { Palette } from "lucide-react";
import type { ColorTarget } from "@musart/core";
import { useTranslation } from "react-i18next";
import { IconButton } from "../shared/IconButton";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { PaletteBrowser } from "./PaletteBrowser";
import "./messages";
import "./palettes.css";
export function PaletteShortcut({
  value,
  targets = [],
  disabled = false,
  onUse,
  beforeApply = () => {},
  onPreview,
  onCancel,
  side = "left",
}: {
  value: string;
  targets?: ColorTarget[];
  disabled?: boolean;
  onUse: (value: string) => void;
  beforeApply?: () => void;
  onPreview?: (value: string) => void;
  onCancel?: () => void;
  side?: "top" | "right" | "bottom" | "left";
}) {
  const { t } = useTranslation("palettes"),
    [open, setOpen] = useState(false);
  return (
    <Popover modal={false} open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton
          type="button"
          className="palette-shortcut"
          label={t("shortcut")}
          tooltipSide="top"
          disabled={disabled}
        >
          <Palette size={15} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        className="floating-panel saved-palette-popover"
        side={side}
        sideOffset={10}
        aria-label={t("shortcut")}
        data-palette-popover
        data-canvas-control
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
        onBlur={(event) => event.stopPropagation()}
        onPointerUpCapture={(event) => {
          if (event.button !== 0) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <PaletteBrowser
          value={value}
          targets={targets}
          onUse={onUse}
          beforeApply={beforeApply}
          onPreview={onPreview}
          onCancel={onCancel}
        />
      </PopoverContent>
    </Popover>
  );
}
