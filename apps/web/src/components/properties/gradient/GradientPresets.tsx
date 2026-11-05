import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dice5, Plus, Trash2, SwatchBook } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FillGradient } from "@musart/core";
import { GradientStore, type SavedGradient } from "../../../services/gradients/store";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { IconButton } from "../../shared/IconButton";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { GRADIENT_PRESETS } from "./presets";
import { randomGradient } from "./random";
import { gradientPreview, sameGradient } from "./paint";
import "./presets.css";
interface Props {
  identity: string;
  gradient: FillGradient;
  disabled?: boolean;
  presetContent?: ReactNode;
  onPreview: (paint: FillGradient) => void;
  onCommit: (paint: FillGradient) => void;
  onCancel: () => void;
}
export function GradientPresets(props: Props) {
  const { t } = useTranslation("gradient");
  const [open, setOpen] = useState(false);
  return (
    <div className="gradient-library-actions">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={props.disabled}>
            <SwatchBook size={14} />
            {t("presets")}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="left"
          align="start"
          className="gradient-library"
          aria-label={t("presets")}
        >
          {open && <Library key={props.identity} {...props} close={() => setOpen(false)} />}
        </PopoverContent>
      </Popover>
      <IconButton
        label={t("random")}
        disabled={props.disabled}
        onClick={() => {
          props.onCancel();
          props.onCommit(randomGradient());
        }}
      >
        <Dice5 size={16} />
      </IconButton>
    </div>
  );
}
function Library({
  gradient,
  disabled,
  onPreview,
  onCommit,
  onCancel,
  close,
  presetContent,
}: Props & { close: () => void }) {
  const { t } = useTranslation("gradient");
  const [tab, setTab] = useState("base");
  const [items, setItems] = useState<SavedGradient[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const store = useRef<GradientStore | null>(null);
  const alive = useRef(false);
  const draft = useRef(false);
  const callbacks = useRef({ onCancel });
  useLayoutEffect(() => {
    callbacks.current = { onCancel };
  }, [onCancel]);
  useEffect(() => {
    const owned = new GradientStore();
    store.current = owned;
    alive.current = true;
    void owned.list().then(
      (saved) => {
        if (alive.current && store.current === owned) {
          setItems(saved);
          setLoading(false);
        }
      },
      () => {
        if (alive.current && store.current === owned) {
          setError(t("loadError"));
          setLoading(false);
        }
      },
    );
    return () => {
      alive.current = false;
      store.current = null;
      owned.dispose();
      if (draft.current) {
        draft.current = false;
        callbacks.current.onCancel();
      }
    };
  }, [t]);
  function cancel() {
    if (draft.current) {
      draft.current = false;
      onCancel();
    }
  }
  function preview(paint: FillGradient) {
    if (!disabled) {
      draft.current = true;
      onPreview(paint);
    }
  }
  useEffect(() => {
    const reset = () => {
      if (draft.current) {
        draft.current = false;
        callbacks.current.onCancel();
      }
    };
    window.addEventListener("blur", reset);
    return () => window.removeEventListener("blur", reset);
  }, []);
  useEffect(() => {
    if (draft.current) {
      draft.current = false;
      callbacks.current.onCancel();
    }
  }, [gradient, disabled]);
  async function mutate(operation: (owned: GradientStore) => Promise<void>) {
    const owned = store.current;
    if (!owned || busy) return;
    setBusy(true);
    setError("");
    try {
      await operation(owned);
      const saved = await owned.list();
      if (alive.current && store.current === owned) {
        setItems(saved);
        setName("");
      }
    } catch {
      if (alive.current && store.current === owned) setError(t("saveError"));
    } finally {
      if (alive.current && store.current === owned) setBusy(false);
    }
  }
  const choices =
    tab === "base"
      ? GRADIENT_PRESETS.map((preset, index) => ({
          ...preset,
          name: t("preset", { number: index + 1 }),
        }))
      : items;
  return (
    <>
      <SegmentedTabs
        mode="choice"
        size="compact"
        label={t("presets")}
        value={tab}
        onValueChange={(next) => {
          cancel();
          setTab(next);
        }}
        items={[
          { value: "base", label: t("base") },
          { value: "saved", label: t("saved") },
        ]}
      />
      <form
        className="gradient-library-save"
        onSubmit={(event) => {
          event.preventDefault();
          cancel();
          const paint = structuredClone(gradient),
            label = name.trim() || t("preset", { number: items.length + 1 });
          void mutate((owned) =>
            owned.save({ id: `gradient-${crypto.randomUUID()}`, name: label, paint }),
          );
        }}
      >
        <Input
          aria-label={t("name")}
          placeholder={t("name")}
          maxLength={64}
          value={name}
          onFocus={cancel}
          onChange={(event) => setName(event.currentTarget.value)}
          disabled={busy || disabled}
        />
        <IconButton type="submit" label={t("save")} disabled={busy || disabled}>
          <Plus size={14} />
        </IconButton>
      </form>
      {error && (
        <p role="alert" className="gradient-library-error">
          {error}
        </p>
      )}
      <ScrollShadow className="gradient-library-shadow">
        <div className="gradient-library-scroll" aria-busy={busy || loading}>
          {tab === "base" && presetContent ? (
            presetContent
          ) : (
            <div
              className="gradient-library-grid"
              onPointerLeave={cancel}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) cancel();
              }}
            >
              {choices.map((preset) => (
                <div className="gradient-library-entry" key={preset.id}>
                  <button
                    type="button"
                    className="gradient-library-preset"
                    aria-label={preset.name}
                    aria-pressed={sameGradient(gradient, preset.paint)}
                    title={preset.name}
                    disabled={disabled}
                    style={{ backgroundImage: gradientPreview(preset.paint) }}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== "touch") preview(preset.paint);
                    }}
                    onFocus={() => preview(preset.paint)}
                    onClick={() => {
                      draft.current = false;
                      onCommit(structuredClone(preset.paint));
                      close();
                    }}
                  />
                  {tab === "saved" && (
                    <IconButton
                      className="gradient-library-delete"
                      label={t("remove", { name: preset.name })}
                      disabled={busy}
                      onFocus={cancel}
                      onPointerEnter={cancel}
                      onClick={() => {
                        cancel();
                        void mutate((owned) => owned.remove(preset.id));
                      }}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
          )}
          {tab === "saved" && !loading && !items.length && (
            <p className="gradient-library-empty">{t("empty")}</p>
          )}
        </div>
      </ScrollShadow>
    </>
  );
}
