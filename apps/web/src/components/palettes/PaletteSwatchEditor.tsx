import { useId, useRef, useState } from "react";
import type { PaletteSwatch } from "@musart/core";
import { useTranslation } from "react-i18next";
import { ColorControl } from "../properties/ColorControl";
import { normalizeHex } from "../properties/color/conversion";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

/** The genuine color control edits the library draft, never the active document. */
export function PaletteSwatchEditor({
  color,
  selected,
  busy,
  disabled,
  onSelect,
  onChange,
  onInvalidChange,
}: {
  color: PaletteSwatch;
  selected: boolean;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
  onChange: (value: string) => void;
  onInvalidChange: (invalid: boolean) => void;
}) {
  const { t } = useTranslation("palettes");
  const [open, setOpen] = useState(false),
    [invalid, setInvalid] = useState(false);
  const errorId = useId();
  const content = useRef<HTMLDivElement>(null);
  function reportInvalid(next: boolean) {
    const input = content.current?.querySelector<HTMLInputElement>(".color-value input");
    if (next) {
      input?.setAttribute("aria-invalid", "true");
      input?.setAttribute("aria-describedby", errorId);
    } else {
      input?.removeAttribute("aria-invalid");
      input?.removeAttribute("aria-describedby");
    }
    setInvalid(next);
    onInvalidChange(next);
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reportInvalid(false);
      }}
      modal={false}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="palette-swatch"
          style={{ background: normalizeHex(color.value) ?? "transparent" }}
          aria-label={t("chooseColor", { name: color.name, value: color.value })}
          aria-pressed={selected}
          disabled={busy}
          onClick={onSelect}
        />
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        className="palette-color-popover floating-panel"
        aria-label={t("chooseColor", { name: color.name, value: color.value })}
        side="right"
        align="start"
        initialFocus="content"
        data-canvas-control="palette-color"
        onChangeCapture={(event) => {
          const input = event.target;
          if (!(input instanceof HTMLInputElement) || !input.closest(".color-value")) return;
          reportInvalid(!normalizeHex(input.value));
        }}
      >
        <ColorControl
          value={normalizeHex(color.value) ?? "#000000"}
          identity={color.id}
          showPaletteShortcut={false}
          disabled={disabled}
          onPreview={() => {}}
          onCommit={(value) => {
            reportInvalid(false);
            onChange(value);
          }}
          onCancel={() => reportInvalid(false)}
        />
        {invalid && (
          <p id={errorId} role="alert" className="palette-error">
            {t("invalidColor")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
