import { Info, MoreHorizontal, Plus } from "lucide-react";
import type { PaletteSwatch, SavedPalette } from "@musart/core";
import { useTranslation } from "react-i18next";
import type { PaletteRecord, PaletteSummary } from "../../services/palettes/library";
import { SelectField } from "../shared/SelectField";
import { ControlHint } from "../shared/ControlHint";
import { IconButton } from "../shared/IconButton";
import { Button } from "../ui/button";
import { PaletteLibraryRow, PaletteSwatches } from "./PaletteLibraryRow";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";

export function PalettePicker({
  items,
  filterId,
  selected,
  detected,
  readPalette,
  onActivate,
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
  filterId: string;
  selected: PaletteRecord | null;
  detected: SavedPalette;
  readPalette: (id: string) => Promise<PaletteRecord>;
  onActivate: (record: PaletteRecord) => void;
  busy: boolean;
  canLink: boolean;
  onLoad: (id: string) => void;
  onNew: () => void;
  onUse: (color: PaletteSwatch, link: boolean, detected: boolean) => void;
  onEdit: (record?: PaletteRecord) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onImport: () => void;
  onExport: () => void;
  onDocument?: () => void;
}) {
  const { t } = useTranslation("palettes");
  const available =
    selected && filterId === selected.id && !items.some(({ id }) => id === selected.id)
      ? [...items, { id: selected.id, name: selected.name, revision: selected.revision }]
      : items;
  const visible =
    filterId === "library:all" ? available : available.filter(({ id }) => id === filterId);
  return (
    <>
      <div className="palette-picker-heading">
        <SelectField
          label={t("library")}
          value={filterId}
          disabled={busy}
          options={[
            { value: "library:all", label: t("all") },
            ...available.map(({ id, name }) => ({ value: id, label: name })),
          ]}
          onValueChange={onLoad}
        />
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
            <DropdownMenuItem disabled={!selected} onSelect={() => onEdit()}>
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!selected} onSelect={onDuplicate}>
              {t("duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onImport}>{t("import")}</DropdownMenuItem>
            <DropdownMenuItem disabled={!selected} onSelect={onExport}>
              {t("export")}
            </DropdownMenuItem>
            {onDocument && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onDocument}>{t("document")}</DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!selected} variant="destructive" onSelect={onDelete}>
              {t("remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="palette-library-list" aria-label={t("library")}>
        {visible.map((summary) => (
          <PaletteLibraryRow
            key={summary.id}
            summary={summary}
            selected={selected?.id === summary.id}
            busy={busy}
            canLink={canLink}
            readPalette={readPalette}
            onActivate={onActivate}
            onUse={(color, link) => onUse(color, link, false)}
            onEdit={onEdit}
          />
        ))}
      </div>
      <div role="separator" className="palette-document-divider" />
      <section className="palette-detected" aria-label={detected.name}>
        <span className="palette-section-name">{detected.name}</span>
        <PaletteSwatches
          colors={detected.colors}
          busy={busy}
          canLink={canLink}
          onUse={(color, link) => onUse(color, link, true)}
          onEdit={onNew}
        />
      </section>
    </>
  );
}
