import { useId, useState } from "react";
import { ArrowLeft, Check, Dices, LockKeyhole, Plus, Save, Trash2, X } from "lucide-react";
import type { PaletteSwatch, SavedPalette } from "@musart/core";
import { varyPalette } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { IconButton } from "../shared/IconButton";
import { PaletteEyedropper } from "./PaletteEyedropper";
import { normalizeHex } from "../properties/color/conversion";
import { PaletteNameInput } from "./PaletteNameInput";
import { PaletteHistoryButtons } from "./PaletteHistoryButtons";
import { PaletteSwatchEditor } from "./PaletteSwatchEditor";
import {
  appendPaletteGeneration,
  createPaletteHistory,
  movePaletteHistory,
} from "./PaletteDraftHistory";

export function PaletteEditor({
  palette,
  value,
  busy,
  onChange,
  onSave,
  onClose,
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
  onClose: () => void;
  onApplyVariation: (colors: PaletteSwatch[]) => void;
  preview: PaletteSwatch[] | null;
  onPreview: (colors: PaletteSwatch[]) => void;
  onCancelPreview: () => void;
}) {
  const { t } = useTranslation("palettes");
  const [activeId, setActiveId] = useState(palette.colors[0]!.id);
  const colors = preview ?? palette.colors,
    active = colors.find((color) => color.id === activeId) ?? colors[0]!;
  const disabled = busy || !!preview;
  const [history, setHistory] = useState(() => createPaletteHistory(palette.colors));
  const [pickerInvalid, setPickerInvalid] = useState(false);
  const errorId = useId();
  if (history.base !== palette.colors || (!preview && history.index >= 0))
    setHistory(createPaletteHistory(palette.colors));
  const invalid = pickerInvalid || colors.some((color) => !normalizeHex(color.value));
  const activeInvalid = !normalizeHex(active.value);
  const canUndo = history.index >= 0,
    canRedo = history.index < history.generations.length - 1;
  function move(direction: -1 | 1) {
    if (busy || (direction === -1 ? !canUndo : !canRedo)) return;
    const next = movePaletteHistory(history, direction);
    setHistory(next);
    if (next.index < 0) onCancelPreview();
    else onPreview(next.generations[next.index]!);
  }
  function cancelGeneration() {
    setHistory(createPaletteHistory(palette.colors));
    onCancelPreview();
  }
  function generate() {
    if (busy || invalid) return;
    const next = varyPalette(colors, Math.random());
    setHistory(appendPaletteGeneration(history, next));
    onPreview(next);
  }
  function update(patch: Partial<PaletteSwatch>) {
    onChange({
      ...palette,
      colors: palette.colors.map((color) =>
        color.id === active.id ? { ...color, ...patch } : color,
      ),
    });
  }
  return (
    <section
      className="palette-editor"
      onKeyDownCapture={(event) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key !== "z" && key !== "y") return;
        if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]"))
          return;
        const direction = key === "y" || event.shiftKey ? 1 : -1;
        if (busy || (direction === -1 ? !canUndo : !canRedo)) return;
        event.preventDefault();
        event.stopPropagation();
        move(direction);
      }}
    >
      <div className="palette-picker-heading">
        <IconButton label={t("back")} tooltipSide="top" disabled={busy} onClick={onClose}>
          <ArrowLeft size={16} />
        </IconButton>
        <PaletteNameInput
          value={palette.name}
          disabled={busy}
          onChange={(name) => onChange({ ...palette, name })}
        />
        <IconButton
          label={t("update")}
          tooltipSide="top"
          disabled={disabled || invalid || !palette.name.trim()}
          onClick={() => {
            if (!invalid && palette.name.trim()) onSave(palette, false);
          }}
        >
          <Check size={16} />
        </IconButton>
      </div>
      <div className="palette-picker-swatches">
        {colors.map((color) => (
          <PaletteSwatchEditor
            key={color.id}
            color={color}
            selected={active.id === color.id}
            busy={busy}
            disabled={disabled}
            onSelect={() => setActiveId(color.id)}
            onInvalidChange={setPickerInvalid}
            onChange={(value) =>
              onChange({
                ...palette,
                colors: palette.colors.map((item) =>
                  item.id === color.id ? { ...item, value } : item,
                ),
              })
            }
          />
        ))}
        {!preview && (
          <IconButton
            label={t("add")}
            disabled={busy || colors.length >= 32 || !normalizeHex(value)}
            onClick={() => {
              const color = { id: crypto.randomUUID(), name: `${colors.length + 1}`, value };
              onChange({ ...palette, colors: [...colors, color] });
              setActiveId(color.id);
            }}
          >
            <Plus size={16} />
          </IconButton>
        )}
      </div>
      <div className="palette-edit-color">
        <Input
          aria-label={t("colorValue")}
          value={active.value}
          aria-invalid={activeInvalid || undefined}
          aria-describedby={activeInvalid ? errorId : undefined}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => update({ value: event.target.value })}
        />
        <PaletteEyedropper
          identity={`${palette.id}:${active.id}:${active.value}`}
          disabled={disabled}
          onPick={(value) => update({ value })}
        />
        <label
          className="palette-lock"
          title={t(active.locked ? "unlocked" : "locked", { name: active.name })}
        >
          <LockKeyhole size={13} aria-hidden="true" />
          <Switch
            size="sm"
            aria-label={t(active.locked ? "unlocked" : "locked", { name: active.name })}
            checked={!!active.locked}
            disabled={disabled}
            onCheckedChange={(locked) => update({ locked })}
          />
        </label>
        <IconButton
          label={t("remove")}
          disabled={disabled || colors.length < 2}
          onClick={() =>
            onChange({
              ...palette,
              colors: palette.colors.filter((color) => color.id !== active.id),
            })
          }
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
      {activeInvalid && (
        <p id={errorId} role="alert" className="palette-error">
          {t("invalidColor")}
        </p>
      )}
      <div className="palette-edit-actions">
        <IconButton
          label={t("dice")}
          tooltipSide="top"
          disabled={busy || invalid}
          onClick={generate}
        >
          <Dices size={17} />
        </IconButton>
        <PaletteHistoryButtons
          busy={busy}
          canUndo={canUndo}
          canRedo={canRedo}
          onMove={move}
          beforeDocumentHistory={cancelGeneration}
        />
        {preview && (
          <>
            <IconButton
              label={t("apply")}
              tooltipSide="top"
              disabled={busy || invalid}
              onClick={() => {
                if (!invalid) onApplyVariation(preview);
              }}
            >
              <Check size={16} />
            </IconButton>
            <IconButton
              label={t("save")}
              tooltipSide="top"
              disabled={busy || invalid || !palette.name.trim()}
              onClick={() =>
                !invalid &&
                palette.name.trim() &&
                onSave(
                  { ...palette, name: t("variationName", { name: palette.name }), colors: preview },
                  true,
                )
              }
            >
              <Save size={16} />
            </IconButton>
            <IconButton
              label={t("cancel")}
              tooltipSide="top"
              disabled={busy}
              onClick={cancelGeneration}
            >
              <X size={16} />
            </IconButton>
          </>
        )}
      </div>
    </section>
  );
}
