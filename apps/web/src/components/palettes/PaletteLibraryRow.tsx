import { useEffect, useRef, useState } from "react";
import type { PaletteSwatch } from "@musart/core";
import { useTranslation } from "react-i18next";
import type { PaletteRecord, PaletteSummary } from "../../services/palettes/library";
import { Button } from "../ui/button";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "../ui/context-menu";

export function PaletteSwatches({
  colors,
  busy,
  canLink,
  onUse,
  onEdit,
}: {
  colors: PaletteSwatch[];
  busy: boolean;
  canLink: boolean;
  onUse: (color: PaletteSwatch, link: boolean) => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation("palettes");
  return (
    <div className="palette-picker-swatches">
      {colors.map((color) => (
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
  );
}

/** Only rows intersecting the bounded library viewport read full palette payloads. */
export function PaletteLibraryRow({
  summary,
  selected,
  busy,
  canLink,
  readPalette,
  onActivate,
  onUse,
  onEdit,
}: {
  summary: PaletteSummary;
  selected: boolean;
  busy: boolean;
  canLink: boolean;
  readPalette: (id: string) => Promise<PaletteRecord>;
  onActivate: (record: PaletteRecord) => void;
  onUse: (color: PaletteSwatch, link: boolean) => void;
  onEdit: (record: PaletteRecord) => void;
}) {
  const { t } = useTranslation("palettes");
  const element = useRef<HTMLDivElement>(null);
  const [payload, setPayload] = useState<{ revision: string; record: PaletteRecord } | null>(null);
  const [error, setError] = useState("");
  const record = payload?.revision === summary.revision ? payload.record : null;
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    let current = true,
      started = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((entry) => entry.isIntersecting)) return;
        started = true;
        observer.disconnect();
        setError("");
        void readPalette(summary.id).then(
          (record) => {
            if (!current) return;
            if (record.revision !== summary.revision) {
              setError(t("changed"));
              return;
            }
            setPayload({ revision: summary.revision, record });
          },
          (reason: unknown) => {
            if (current) setError(reason instanceof Error ? reason.message : t("failed"));
          },
        );
      },
      { root: node.closest(".palette-library-list") },
    );
    observer.observe(node);
    return () => {
      current = false;
      observer.disconnect();
    };
  }, [summary.id, summary.revision, readPalette, t]);
  return (
    <div ref={element} className="palette-library-row" data-palette-id={summary.id}>
      <Button
        variant="ghost"
        className="palette-library-name"
        aria-pressed={selected}
        disabled={busy || !record}
        onClick={() => record && onActivate(record)}
      >
        {summary.name}
      </Button>
      {record ? (
        <PaletteSwatches
          colors={record.colors}
          busy={busy}
          canLink={canLink}
          onUse={onUse}
          onEdit={() => onEdit(record)}
        />
      ) : (
        <div className="palette-library-loading" aria-label={t("loading")} />
      )}
      {error && (
        <p role="alert" className="palette-error">
          {error}
        </p>
      )}
    </div>
  );
}
