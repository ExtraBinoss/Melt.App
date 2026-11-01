import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Upload, Trash2 } from "lucide-react";
import { getEffectDefinition, type Effect, type EnginePort, type ImageAsset } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "../../../ui/popover";
import { Button } from "../../../ui/button";
import { ScrollShadow } from "../../../shared/scroll/ScrollShadow";
import { SegmentedTabs } from "../../../shared/segmented/SegmentedTabs";
import { TextureStore, type TextureHeader } from "../../../../services/textures/store";
import {
  assignEffectImage,
  BUILTIN_TEXTURES,
  loadBuiltinTexture,
} from "../../../../services/textures/library";
import "../library-messages";
import "./texture-picker.css";
export function EffectImageInputs({
  engine,
  layerId,
  effect,
  disabled,
}: {
  engine?: EnginePort;
  layerId?: string;
  effect: Effect;
  disabled: boolean;
}) {
  const inputs = getEffectDefinition(effect.type).inputs;
  return inputs?.map((input) => (
    <TextureInput
      key={input.key}
      inputKey={input.key}
      labelKey={input.labelKey}
      engine={engine}
      layerId={layerId}
      effect={effect}
      disabled={disabled}
    />
  ));
}
function TextureInput({
  engine,
  layerId,
  effect,
  inputKey,
  labelKey,
  disabled,
}: {
  engine?: EnginePort;
  layerId?: string;
  effect: Effect;
  inputKey: string;
  labelKey: string;
  disabled: boolean;
}) {
  const { t } = useTranslation("displaceFx");
  const store = useRef<TextureStore | null>(null);
  const getStore = useCallback(() => (store.current ??= new TextureStore()), []);
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState("base"),
    [items, setItems] = useState<TextureHeader[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const session = useRef<AbortController | null>(null),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const owned = getStore();
    return () => {
      session.current?.abort();
      owned.dispose();
      if (store.current === owned) store.current = null;
    };
  }, [getStore]);
  function changeOpen(next: boolean) {
    session.current?.abort();
    session.current = next ? new AbortController() : null;
    setOpen(next);
    setBusy(false);
    setError("");
    if (next) {
      const controller = session.current!;
      void getStore()
        .list()
        .then(
          (value) => {
            if (!controller.signal.aborted) setItems(value);
          },
          () => {
            if (!controller.signal.aborted) setError(t("loadError"));
          },
        );
    }
  }
  async function choose(load: (signal: AbortSignal) => Promise<ImageAsset>) {
    const controller = session.current;
    if (!engine || !layerId || !controller || busy) return;
    const before = engine.getSnapshot();
    setBusy(true);
    setError("");
    try {
      const asset = await load(controller.signal);
      controller.signal.throwIfAborted();
      assignEffectImage(engine, before, layerId, effect.id, inputKey, asset);
      changeOpen(false);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(t(reason instanceof Error && reason.message === "stale" ? "stale" : "saveError"));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const selected = effect.inputs?.[inputKey];
  return (
    <div className="effect-image-input">
      <Popover open={open} onOpenChange={changeOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled || !engine || !layerId}
            className="texture-input-trigger"
          >
            <ImagePlus size={14} />
            {t(labelKey)}
            <span>{t(selected ? "selected" : "procedural")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="texture-picker floating-panel"
          align="end"
          aria-label={t("library")}
        >
          <div className="texture-picker-heading">
            <strong>{t("library")}</strong>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("import")}
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              <Upload size={14} />
            </Button>
          </div>
          <input
            ref={file}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const original = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (original)
                void choose(async (signal) => {
                  const owned = getStore();
                  const header = await owned.import(original, signal);
                  signal.throwIfAborted();
                  return owned.get(header.id);
                });
            }}
          />
          <SegmentedTabs
            mode="choice"
            size="compact"
            value={tab}
            label={t("library")}
            onValueChange={setTab}
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
                        disabled={busy}
                        className="texture-picker-tile"
                        onClick={() => void choose((signal) => loadBuiltinTexture(item.id, signal))}
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
                          disabled={busy}
                          aria-pressed={selected === item.id}
                          className="texture-picker-tile"
                          onClick={() => void choose(() => getStore().get(item.id))}
                        >
                          <img loading="lazy" src={item.preview} alt="" />
                          <span>{item.name}</span>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy}
                          aria-label={t("delete", { name: item.name })}
                          onClick={() => {
                            const controller = session.current;
                            setBusy(true);
                            void getStore()
                              .delete(item.id)
                              .then(
                                () => {
                                  if (!controller?.signal.aborted)
                                    setItems((current) =>
                                      current.filter((value) => value.id !== item.id),
                                    );
                                },
                                () => {
                                  if (!controller?.signal.aborted) setError(t("saveError"));
                                },
                              )
                              .finally(() => {
                                if (!controller?.signal.aborted) setBusy(false);
                              });
                          }}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    ))}
              </div>
              {tab === "saved" && !items.length && (
                <Button variant="outline" disabled={busy} onClick={() => file.current?.click()}>
                  <Upload size={14} />
                  {t("import")}
                </Button>
              )}
            </div>
          </ScrollShadow>
          {selected && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (engine && layerId) {
                  try {
                    assignEffectImage(engine, engine.getSnapshot(), layerId, effect.id, inputKey);
                    changeOpen(false);
                  } catch {
                    setError(t("stale"));
                  }
                }
              }}
            >
              {t("clear")}
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
