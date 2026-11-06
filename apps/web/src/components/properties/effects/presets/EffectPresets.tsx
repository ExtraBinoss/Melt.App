import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircleDot, Ellipsis, RotateCcw } from "lucide-react";
import {
  effectMatchesTreatment,
  captureEffectTreatment,
  type Effect,
  type EnginePort,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { SelectField } from "../../../shared/SelectField";
import { IconButton } from "../../../shared/IconButton";
import { Button } from "../../../ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../../ui/dropdown-menu";
import { applyTreatment } from "../../../../services/effect-presets/apply";
import type { SavedTreatment } from "../../../../services/effect-presets/store";
import { SaveTreatment } from "./SaveTreatment";
import { TreatmentNameForm } from "./TreatmentNameForm";
import { useEffectPresetPreview } from "./use-effect-preset-preview";
import { useEffectLibrary } from "./use-library";
import "./messages";
import "./presets.css";
export function EffectPresets({
  effect,
  engine,
  layerId,
  disabled,
  onChange,
  onCancel,
  onReset,
  onDelete,
  stackEffects,
  registerDeactivate,
}: {
  effect: Effect;
  engine?: EnginePort;
  layerId?: string;
  disabled: boolean;
  onChange: (patch: Partial<Effect>) => void;
  onCancel?: () => void;
  onReset: () => void;
  onDelete?: () => void;
  stackEffects?: readonly Effect[];
  registerDeactivate?: (cancel: () => void) => () => void;
}) {
  const { t } = useTranslation("effectPresets");
  const library = useEffectLibrary(Boolean(engine));
  const [saved, setSaved] = useState<SavedTreatment | null>(null);
  const [rename, setRename] = useState(false),
    [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveStack, setSaveStack] = useState(false);
  const [saveEffect, setSaveEffect] = useState(false);
  const reference = effect.preset?.id;
  const [loaded, setLoaded] = useState(!reference || !engine);
  const generation = useRef({ value: 0 });
  const latest = useRef(effect);
  useLayoutEffect(() => {
    latest.current = effect;
  }, [effect]);
  const { items, getStore, setError } = library;
  const preview = useEffectPresetPreview({
    engine,
    effect,
    layerId,
    getStore,
    onCancel,
    onError: setError,
  });
  useLayoutEffect(() => registerDeactivate?.(preview.cancel), [registerDeactivate, preview.cancel]);
  const [source, setSource] = useState({ id: effect.id, reference, items });
  if (source.id !== effect.id || source.reference !== reference || source.items !== items) {
    setSource({ id: effect.id, reference, items });
    setSaved(null);
    setLoaded(!reference || !engine);
    if (source.id !== effect.id || source.reference !== reference) {
      setRename(false);
      setSaveStack(false);
      setSaveEffect(false);
    }
    setBusy(false);
  }
  useEffect(() => {
    const lifetime = generation.current;
    const token = ++lifetime.value;
    if (reference && engine)
      void getStore()
        .get(reference)
        .then(
          (record) => {
            if (token === generation.current.value) {
              setSaved(record);
              setLoaded(true);
            }
          },
          (reason) => {
            if (token === generation.current.value) {
              setError(reason instanceof Error ? reason.message : t("failure"));
              setLoaded(true);
            }
          },
        );
    return () => {
      lifetime.value++;
    };
  }, [engine, effect.id, reference, items, getStore, setError, t]);
  async function operation(action: (current: () => boolean) => Promise<void>) {
    if (busy) return;
    preview.cancel();
    onCancel?.();
    const token = generation.current.value;
    setBusy(true);
    library.setError("");
    try {
      await action(() => token === generation.current.value);
    } catch (reason) {
      if (token === generation.current.value)
        library.setError(
          reason instanceof Error && reason.message === "stale"
            ? t("stale")
            : reason instanceof Error
              ? reason.message
              : t("failure"),
        );
    } finally {
      if (token === generation.current.value) setBusy(false);
    }
  }
  async function apply(id: string) {
    if (!engine) return;
    preview.cancel();
    const origin = engine.getSnapshot(),
      owned = effect,
      token = generation.current.value;
    const record = await library.getStore().get(id);
    if (token !== generation.current.value || latest.current !== owned) return;
    if (!record) throw Error(t("unavailable"));
    applyTreatment(
      engine,
      origin,
      { pageId: origin.pageId, ...(layerId ? { layerIds: [layerId] } : {}), effectId: effect.id },
      record.treatment,
      "replace",
    );
    setSaved(record);
  }
  const options = library.items
    .filter((item) => item.kind === "effect" && item.types[0] === effect.type)
    .map((item) => ({ value: item.id, label: item.name }));
  if (reference && !options.some((option) => option.value === reference))
    options.unshift({ value: reference, label: saved?.name ?? effect.preset!.name });
  const unavailable = Boolean(reference && loaded && !saved);
  const modified =
    saved && !effectMatchesTreatment(effect, saved.treatment, engine?.getSnapshot().project.assets);
  const selectedName = saved?.name ?? effect.preset?.name ?? t("custom");
  const selectedLabel =
    reference && (unavailable || !loaded || modified)
      ? t(unavailable ? "unavailableLabel" : !loaded ? "loadingLabel" : "modifiedLabel", {
          name: selectedName,
        })
      : selectedName;
  return (
    <div className="effect-presets" data-effect-presets={effect.id}>
      <div className="effect-preset-bar">
        <SelectField
          prewarm={false}
          label={t("preset")}
          identity={effect.id}
          value={reference ?? "custom"}
          selectedLabel={
            <span className="effect-preset-selected" aria-label={selectedLabel}>
              <span>{selectedLabel}</span>
              {modified && <CircleDot size={12} aria-hidden="true" />}
            </span>
          }
          disabled={disabled || !engine || busy}
          options={[{ value: "custom", label: t("custom"), disabled: true }, ...options]}
          previewCurrent={Boolean(modified)}
          onPreview={preview.preview}
          onPreviewCancel={preview.cancel}
          onValueChange={(id) => void operation(() => apply(id))}
        />
        <SaveTreatment
          key={`${effect.id}:${layerId ?? "composition"}`}
          open={saveEffect}
          onOpenChange={setSaveEffect}
          onStart={() => {
            preview.cancel();
            onCancel?.();
            setSaveStack(false);
            setRename(false);
          }}
          engine={engine}
          effects={[effect]}
          kind="effect"
          disabled={disabled || busy}
          onSaved={(record) => {
            setSaved(record);
            preview.cancel();
            onChange({ preset: { id: record.id, name: record.name } });
            void library.refresh();
          }}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={t("actions")} disabled={disabled || busy}>
              <Ellipsis size={14} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {stackEffects && (
              <DropdownMenuItem
                disabled={!engine || !stackEffects.length}
                onSelect={() => {
                  preview.cancel();
                  onCancel?.();
                  setSaveEffect(false);
                  setRename(false);
                  setSaveStack(true);
                }}
              >
                {t("saveStack")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={!saved || !engine}
              onSelect={() => void operation(() => apply(saved!.id))}
            >
              <RotateCcw size={14} />
              {t("restore")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!saved || !engine}
              onSelect={() =>
                void operation(async (current) => {
                  const owned = latest.current,
                    origin = engine!.getSnapshot();
                  const next = captureEffectTreatment(
                    saved!.id,
                    saved!.name,
                    [owned],
                    origin.project.assets,
                    "effect",
                  );
                  const record = await library.getStore().save(next, saved!.revision);
                  if (current()) {
                    setSaved(record);
                    await library.refresh();
                  }
                })
              }
            >
              {t("update")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!saved}
              onSelect={() => {
                preview.cancel();
                setSaveEffect(false);
                setSaveStack(false);
                setName(saved!.name);
                setRename(true);
              }}
            >
              {t("rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!saved}
              variant="destructive"
              onSelect={() =>
                void operation(async (current) => {
                  await library.getStore().delete(saved!);
                  if (current()) {
                    setSaved(null);
                    setLoaded(true);
                    await library.refresh();
                  }
                })
              }
            >
              {t("delete")}
            </DropdownMenuItem>
            {onDelete && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  preview.cancel();
                  onDelete();
                }}
              >
                {t("removeEffect", { ns: "translation" })}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton
          label={t("defaults")}
          data-effect-reset=""
          disabled={disabled || busy}
          onPointerDown={(event) => {
            if (event.button === 0) event.preventDefault();
          }}
          onClick={() => {
            preview.cancel();
            onReset();
          }}
        >
          <RotateCcw size={14} aria-hidden="true" />
        </IconButton>
      </div>
      {stackEffects && (
        <SaveTreatment
          key={`stack:${effect.id}:${layerId ?? "composition"}`}
          engine={engine}
          effects={stackEffects}
          kind="stack"
          disabled={disabled || busy}
          open={saveStack}
          onOpenChange={setSaveStack}
          hideTrigger
          onSaved={() => void library.refresh()}
        />
      )}
      {rename && saved && (
        <TreatmentNameForm
          label={t("name")}
          name={name}
          onName={setName}
          busy={busy}
          onCancel={() => setRename(false)}
          onSubmit={(event) => {
            event.preventDefault();
            void operation(async (current) => {
              const record = await library
                .getStore()
                .save({ ...saved.treatment, name: name.trim() }, saved.revision);
              if (current()) {
                setSaved(record);
                setRename(false);
                await library.refresh();
              }
            });
          }}
        />
      )}
      {library.before && (
        <Button size="sm" variant="ghost" onClick={() => void library.refresh(library.before!)}>
          {t("more")}
        </Button>
      )}
      {library.error && <p role="alert">{library.error}</p>}
      {library.error && (
        <Button size="sm" variant="ghost" onClick={() => void library.refresh()}>
          {t("reload")}
        </Button>
      )}
    </div>
  );
}
