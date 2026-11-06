import { Info, MoreHorizontal, Plus } from "lucide-react";
import type { PaletteSwatch, SavedPalette } from "@musart/core";
import { useTranslation } from "react-i18next";
import type { PaletteSummary } from "../../services/palettes/library";
import { SelectField } from "../shared/SelectField";
import { ControlHint } from "../shared/ControlHint";
import { IconButton } from "../shared/IconButton";
import { Button } from "../ui/button";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "../ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";

export function PalettePicker({
  items,
  selectedId,
  palette,
  detected,
  personal,
  busy,
  canLink,
  onLoad,
  onNew,
  onUse,
  onEdit,
  onDuplicate,
  onDelete,
  onImport,
  onExport,
  onDocument,
}: {
  items: PaletteSummary[];
  selectedId?: string;
  palette: SavedPalette | null;
  detected: SavedPalette;
  personal: boolean;
  busy: boolean;
  canLink: boolean;
  onLoad: (id: string) => void;
  onNew: () => void;
  onUse: (color: PaletteSwatch, link: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onImport: () => void;
  onExport: () => void;
  onDocument?: () => void;
}) {
  const { t } = useTranslation("palettes");
  return (
    <>
      <div className="palette-picker-heading">
        {items.length || detected.colors.length ? (
          <SelectField
            label={t("library")}
            value={selectedId ?? ""}
            selectedLabel={palette?.name}
            disabled={busy}
            options={[
              { value: detected.id, label: detected.name },
              ...items.map(({ id, name }) => ({ value: id, label: name })),
            ]}
            onValueChange={onLoad}
          />
        ) : (
          <span className="palette-picker-placeholder">{t("shortcut")}</span>
        )}
        <IconButton label={t("new")} tooltipSide="top" disabled={busy} onClick={onNew}>
          <Plus size={16} />
        </IconButton>
        <ControlHint content={t("info")}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="palette-info"
            aria-label={t("infoLabel")}
          >
            <Info size={14} />
          </Button>
        </ControlHint>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              className="palette-more"
              label={t("actions")}
              tooltipSide="top"
              disabled={busy}
            >
              <MoreHorizontal size={15} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!palette} onSelect={onEdit}>
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!personal} onSelect={onDuplicate}>
              {t("duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onImport}>{t("import")}</DropdownMenuItem>
            <DropdownMenuItem disabled={!personal} onSelect={onExport}>
              {t("export")}
            </DropdownMenuItem>
            {onDocument && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onDocument}>{t("linkedColors")}</DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!personal} variant="destructive" onSelect={onDelete}>
              {t("remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="palette-picker-swatches">
        {palette?.colors.map((color) => (
          <ContextMenu key={color.id}>
            <ContextMenuTrigger asChild>
              <Button
                variant="ghost"
                className="palette-swatch"
                style={{ background: color.value }}
                aria-label={`${color.name} ${color.value}`}
                title={color.value}
                disabled={busy}
                onClick={() => onUse(color, false)}
              />
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => onUse(color, false)}>{t("local")}</ContextMenuItem>
              <ContextMenuItem disabled={!canLink} onSelect={() => onUse(color, true)}>
                {t("link")}
              </ContextMenuItem>
              <ContextMenuItem onSelect={onEdit}>{t("edit")}</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>
    </>
  );
}
