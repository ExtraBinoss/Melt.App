import { useRef } from "react";
import { Trash2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BUILTIN_TEXTURES } from "../../../../services/textures/library";
import type { TextureHeader } from "../../../../services/textures/store";
import { Button } from "../../../ui/button";
import { ScrollShadow } from "../../../shared/scroll/ScrollShadow";
import { SegmentedTabs } from "../../../shared/segmented/SegmentedTabs";

/** Radix owns this content's lifetime, including its complete exit animation. */
export function TexturePickerContent({
  tab,
  items,
  selected,
  busy,
  disabled,
  error,
  onTabChange,
  onImport,
  onBuiltin,
  onSaved,
  onDelete,
  onClear,
}: {
  tab: string;
  items: readonly TextureHeader[];
  selected?: string;
  busy: boolean;
  disabled: boolean;
  error: string;
  onTabChange: (tab: string) => void;
  onImport: (file: File) => void;
  onBuiltin: (id: string) => void;
  onSaved: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation("displaceFx");
  const file = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="texture-picker-heading">
        <strong>{t("library")}</strong>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("import")}
          disabled={disabled}
          onClick={() => file.current?.click()}
        >
          <Upload size={14} />
        </Button>
      </div>
      <input
        ref={file}
        type="file"
        hidden
        disabled={disabled}
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const original = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (original && !disabled) onImport(original);
        }}
      />
      <SegmentedTabs
        mode="choice"
        size="compact"
        value={tab}
        disabled={disabled}
        label={t("library")}
        onValueChange={onTabChange}
        items={[
          { value: "base", label: t("base") },
          { value: "saved", label: t("saved") },
        ]}
      />
      {error && (
        <p role="alert" className="texture-picker-error">
          {error}
        </p>
      )}
      <ScrollShadow>
        <div className="texture-picker-scroll">
          <div className="texture-picker-grid" aria-busy={busy}>
            {tab === "base"
              ? BUILTIN_TEXTURES.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={selected === `texture-${item.sha256}`}
                    disabled={disabled}
                    className="texture-picker-tile"
                    onClick={() => onBuiltin(item.id)}
                  >
                    <img
                      loading="lazy"
                      src={`${import.meta.env.BASE_URL}textures/${item.id}.webp`}
                      alt=""
                    />
                    <span>{t(`textures.${item.id}`)}</span>
                  </button>
                ))
              : items.map((item) => (
                  <div key={item.id} className="texture-picker-saved">
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected === item.id}
                      className="texture-picker-tile"
                      onClick={() => onSaved(item.id)}
                    >
                      <img loading="lazy" src={item.preview} alt="" />
                      <span>{item.name}</span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={disabled}
                      aria-label={t("delete", { name: item.name })}
                      onClick={() => onDelete(item.id)}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}
          </div>
          {tab === "saved" && !items.length && (
            <Button variant="outline" disabled={disabled} onClick={() => file.current?.click()}>
              <Upload size={14} />
              {t("import")}
            </Button>
          )}
        </div>
      </ScrollShadow>
      {selected && (
        <Button variant="ghost" disabled={disabled} onClick={onClear}>
          {t("clear")}
        </Button>
      )}
    </>
  );
}
