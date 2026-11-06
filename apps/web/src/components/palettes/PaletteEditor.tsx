import { useState } from "react";
import { Dices, LockKeyhole, LockKeyholeOpen, Plus, X } from "lucide-react";
import type { PaletteSwatch, SavedPalette } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { IconButton } from "../shared/IconButton";
export function PaletteEditor({
  palette,
  value,
  busy,
  onChange,
  onSave,
  onUse,
  onApplyVariation,
  preview,
  onPreview,
  onCancelPreview,
}: {
  palette: SavedPalette;
  value: string;
  busy: boolean;
  onChange: (palette: SavedPalette) => void;
  onSave: (palette: SavedPalette, asNew: boolean) => void;
  onUse: (color: PaletteSwatch, link: boolean) => void;
  onApplyVariation: (colors: PaletteSwatch[]) => void;
  preview: PaletteSwatch[] | null;
  onPreview: (colors: PaletteSwatch[]) => void;
  onCancelPreview: () => void;
}) {
  const { t } = useTranslation("palettes");
  const [link, setLink] = useState(false);
  const colors = preview ?? palette.colors;
  function change(colors: PaletteSwatch[]) {
    onChange({ ...palette, colors });
  }
  return (
    <section className="palette-editor">
      <Input
        aria-label={t("name")}
        value={palette.name}
        maxLength={100}
        disabled={busy || !!preview}
        onChange={(event) => onChange({ ...palette, name: event.target.value })}
      />
      <label className="palette-link-option">
        <input type="checkbox" checked={link} onChange={(event) => setLink(event.target.checked)} />
        {t("link")}
      </label>
      {preview && <strong>{t("variation")}</strong>}
      <div className="palette-editor-swatches">
        {colors.map((color) => (
          <div key={color.id} className="palette-editor-swatch">
            <button
              type="button"
              className="palette-swatch"
              style={{ background: color.value }}
              aria-label={`${color.name} ${color.value}`}
              title={`${color.name} ${color.value}`}
              disabled={busy || !!preview}
              onClick={() => onUse(color, link)}
            />
            <Input
              aria-label={t("globalName")}
              value={color.name}
              maxLength={100}
              disabled={busy || !!preview}
              onChange={(event) =>
                change(
                  palette.colors.map((item) =>
                    item.id === color.id ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
            />
            <Input
              aria-label={t("colorValue")}
              value={color.value}
              disabled={busy || !!preview}
              onChange={(event) =>
                change(
                  palette.colors.map((item) =>
                    item.id === color.id ? { ...item, value: event.target.value } : item,
                  ),
                )
              }
            />
            <IconButton
              label={t(color.locked ? "unlocked" : "locked", { name: color.name })}
              aria-pressed={!!color.locked}
              disabled={busy || !!preview}
              onClick={() =>
                change(
                  palette.colors.map((item) =>
                    item.id === color.id ? { ...item, locked: !item.locked } : item,
                  ),
                )
              }
            >
              {color.locked ? <LockKeyhole size={13} /> : <LockKeyholeOpen size={13} />}
            </IconButton>
            <IconButton
              label={t("remove")}
              disabled={busy || !!preview || colors.length < 2}
              onClick={() => change(colors.filter((item) => item.id !== color.id))}
            >
              <X size={13} />
            </IconButton>
          </div>
        ))}
      </div>
      <div className="palette-actions">
        {preview ? (
          <>
            <IconButton label={t("dice")} disabled={busy} onClick={() => onPreview(palette.colors)}>
              <Dices size={16} />
            </IconButton>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                onApplyVariation(preview);
              }}
            >
              {t("apply")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                onSave(
                  { ...palette, name: t("variationName", { name: palette.name }), colors: preview },
                  true,
                )
              }
            >
              {t("save")}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={onCancelPreview}>
              {t("cancel")}
            </Button>
          </>
        ) : (
          <>
            <IconButton
              label={t("add")}
              disabled={busy || palette.colors.length >= 32}
              onClick={() =>
                change([
                  ...colors,
                  { id: crypto.randomUUID(), name: `${colors.length + 1}`, value },
                ])
              }
            >
              <Plus size={14} />
            </IconButton>
            <IconButton label={t("dice")} disabled={busy} onClick={() => onPreview(colors)}>
              <Dices size={16} />
            </IconButton>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !palette.name.trim()}
              onClick={() => onSave(palette, false)}
            >
              {t("update")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !palette.name.trim()}
              onClick={() => onSave(palette, true)}
            >
              {t("save")}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
