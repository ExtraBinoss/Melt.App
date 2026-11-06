import { DepthPreparation } from "../library/depth-anything/DepthPreparation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import {
  createLayerGeometryIndex,
  getEffectDefinition,
  type Effect,
  type EnginePort,
  type ImageAsset,
  type SessionSnapshot,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "../../../ui/popover";
import { Button } from "../../../ui/button";
import { TextureStore, type TextureHeader } from "../../../../services/textures/store";
import { assignEffectImage, loadBuiltinTexture } from "../../../../services/textures/library";
import { TexturePickerContent } from "./TexturePickerContent";
import "../library-messages";
import "./texture-picker.css";
interface TextureOpening {
  controller: AbortController;
  engine: EnginePort;
  snapshot: SessionSnapshot;
  layerId: string;
  effect: Effect;
  inputKey: string;
}
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
  if (effect.type === "depth-anything")
    return (
      <DepthPreparation
        key={`${layerId}:${effect.id}`}
        engine={engine}
        layerId={layerId}
        effect={effect}
        disabled={disabled}
      />
    );
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
  const session = useRef<TextureOpening | null>(null);
  const latest = useRef({ engine, layerId, effect, inputKey, disabled });
  const close = useCallback(() => {
    session.current?.controller.abort();
    session.current = null;
    setOpen(false);
    setBusy(false);
    setError("");
  }, []);
  const current = useCallback((opening: TextureOpening | null) => {
    const props = latest.current;
    if (
      !opening ||
      session.current !== opening ||
      opening.controller.signal.aborted ||
      props.disabled ||
      props.engine !== opening.engine ||
      props.layerId !== opening.layerId ||
      props.effect !== opening.effect ||
      props.inputKey !== opening.inputKey
    )
      return false;
    const snapshot = opening.engine.getSnapshot();
    const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId);
    const origin = opening.snapshot.project.pages.find(
      (item) => item.id === opening.snapshot.pageId,
    );
    return Boolean(
      page &&
      snapshot.project.id === opening.snapshot.project.id &&
      snapshot.pageId === opening.snapshot.pageId &&
      page.layers === origin?.layers &&
      snapshot.selection.length === opening.snapshot.selection.length &&
      snapshot.selection.every((id, index) => id === opening.snapshot.selection[index]) &&
      page.layers.some(
        (layer) =>
          layer.id === opening.layerId && layer.effects.some((item) => item === opening.effect),
      ) &&
      !createLayerGeometryIndex(page).isLocked(opening.layerId),
    );
  }, []);
  useLayoutEffect(() => {
    latest.current = { engine, layerId, effect, inputKey, disabled };
    if (session.current && !current(session.current)) close();
  }, [engine, layerId, effect, inputKey, disabled, current, close]);
  useLayoutEffect(() => {
    return engine?.subscribe(() => {
      if (session.current && !current(session.current)) close();
    });
  }, [engine, current, close]);
  useEffect(() => {
    return () => {
      session.current?.controller.abort();
      session.current = null;
      store.current?.dispose();
      store.current = null;
    };
  }, []);
  function changeOpen(next: boolean) {
    close();
    if (next) {
      if (!engine || !layerId || disabled) return;
      const opening = {
        controller: new AbortController(),
        engine,
        snapshot: engine.getSnapshot(),
        layerId,
        effect,
        inputKey,
      };
      session.current = opening;
      if (!current(opening)) return close();
      setOpen(true);
      void getStore()
        .list()
        .then(
          (value) => {
            if (current(opening)) setItems(value);
          },
          () => {
            if (current(opening)) setError(t("loadError"));
          },
        );
    }
  }
  async function choose(load: (signal: AbortSignal) => Promise<ImageAsset>) {
    const opening = session.current;
    if (!opening || !current(opening) || busy) return;
    const { controller } = opening;
    const before = opening.engine.getSnapshot();
    setBusy(true);
    setError("");
    try {
      const asset = await load(controller.signal);
      controller.signal.throwIfAborted();
      if (!current(opening)) return;
      assignEffectImage(
        opening.engine,
        before,
        opening.layerId,
        opening.effect.id,
        opening.inputKey,
        asset,
      );
      changeOpen(false);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(t(reason instanceof Error && reason.message === "stale" ? "stale" : "saveError"));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function remove(id: string) {
    const opening = session.current;
    if (!opening || !current(opening) || busy) return;
    setBusy(true);
    void getStore()
      .delete(id)
      .then(
        () => {
          if (current(opening)) setItems((items) => items.filter((item) => item.id !== id));
        },
        () => {
          if (current(opening)) setError(t("saveError"));
        },
      )
      .finally(() => {
        if (current(opening)) setBusy(false);
      });
  }
  function clear() {
    const opening = session.current;
    if (!opening || !current(opening) || busy) return;
    try {
      assignEffectImage(
        opening.engine,
        opening.engine.getSnapshot(),
        opening.layerId,
        opening.effect.id,
        opening.inputKey,
      );
      changeOpen(false);
    } catch {
      setError(t("stale"));
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
          <TexturePickerContent
            tab={tab}
            items={items}
            selected={selected}
            busy={busy}
            disabled={!open || disabled || busy}
            error={error}
            onTabChange={(next) => {
              if (current(session.current) && !busy) setTab(next);
            }}
            onImport={(original) => {
              void choose(async (signal) => {
                const owned = getStore();
                const header = await owned.import(original, signal);
                signal.throwIfAborted();
                return owned.get(header.id);
              });
            }}
            onBuiltin={(id) => void choose((signal) => loadBuiltinTexture(id, signal))}
            onSaved={(id) => void choose(() => getStore().get(id))}
            onDelete={remove}
            onClear={clear}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
