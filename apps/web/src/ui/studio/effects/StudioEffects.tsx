import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, SlidersHorizontal, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createEffect,
  type Composition,
  type Effect,
  type EnginePort,
  type Layer,
  type Project,
} from "@musart/core";
import type { EditorServices } from "../../../state/contracts";
import { useDocumentSnapshot } from "../../../state/session/use-document-snapshot";
import { layerSelection } from "../../../components/layers/menu/selection";
import { LayerThumbnail } from "../../../components/layers/rows/LayerThumbnail";
import { SelectionPreviewIdentity } from "../../../services/projects/thumbnails/selection-identity";
import { useLayerPreview } from "../../../components/layers/controls/use-layer-preview";
import { MotionFieldProvider } from "../../../components/properties/motion/context";
import { EffectStack } from "../../../components/properties/effects/EffectStack";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Button } from "../../../components/ui/button";
import { IconButton } from "../../../components/shared/IconButton";
import { ScrollShadow } from "../../../components/shared/scroll/ScrollShadow";
import { ownerHasDepth, type EffectCategory } from "../../../components/layers/catalog/model";
import { StudioEffectCatalog } from "./StudioEffectCatalog";
import { useCompositionEffectMotionRequest } from "../../../components/motion/scene/effect-navigation";
import { useCompositionEffects } from "../../../components/layers/controls/use-composition-effects";
import "./messages";
import "./effects.css";
import "../../../components/layers/rows/layer-row.css";

interface StudioEffectsProps {
  engine: EnginePort;
  services?: Pick<EditorServices, "previewExport">;
  run: (task: () => void) => void;
}

export function StudioEffects(props: StudioEffectsProps) {
  return (
    <>
      <EffectButton {...props} category="effect" />
      <EffectButton {...props} category="adjustment" />
    </>
  );
}
function EffectButton({
  engine,
  services,
  run,
  category,
}: StudioEffectsProps & {
  category: EffectCategory;
}) {
  const { t } = useTranslation("studioEffects");
  const [open, setOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    // Radix can reuse content during its exit animation, without another mount autofocus.
    if (open) {
      restoreFocus.current = false;
      content.current?.focus({ preventScroll: true });
    }
  }, [open]);
  const [request, setRequest] = useState<{ token: number; effectId: string } | null>(null);
  useCompositionEffectMotionRequest(engine, (request) => {
    if (request.category !== category) {
      setOpen(false);
      return;
    }
    engine.select([]);
    setRequest({ token: request.token, effectId: request.effectId });
    setOpen(true);
  });
  const Icon = category === "effect" ? Sparkles : SlidersHorizontal;
  const label = t(category === "effect" ? "addEffect" : "addGrade");
  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton
          ref={trigger}
          label={label}
          tooltipSide="bottom"
          className="studio-surface"
          data-studio-effect-category={category}
        >
          <Icon size={15} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        onEscapeKeyDown={() => {
          restoreFocus.current = true;
        }}
        onCloseAutoFocus={(event) => {
          // A rapid reopen can retain Radix's prior outside-interaction flag.
          // Restore keyboard focus for Escape without stealing an outside canvas click.
          if (restoreFocus.current) {
            event.preventDefault();
            restoreFocus.current = false;
            trigger.current?.focus({ preventScroll: true });
          }
        }}
        className="studio-effects-popover"
        side="bottom"
        align="end"
        collisionPadding={12}
        initialFocus="content"
        aria-label={label}
        data-canvas-control
      >
        <EffectEditor
          engine={engine}
          services={services}
          run={run}
          category={category}
          request={request}
        />
      </PopoverContent>
    </Popover>
  );
}
function EffectEditor({
  engine,
  services,
  run,
  category,
  request,
}: StudioEffectsProps & {
  category: EffectCategory;
  request: { token: number; effectId: string } | null;
}) {
  const snapshot = useDocumentSnapshot(engine, true);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const layer = page.layers.find((item) => item.id === snapshot.selection[0]);
  const identities = useMemo(() => new SelectionPreviewIdentity(), [engine]);
  const previewKey = layer
    ? `${snapshot.project.id}:${page.id}:${identities.read(page, snapshot.project.assets, [layer.id])}`
    : "";
  return (
    <OwnedEditor
      key={`${snapshot.project.id}:${page.id}:${snapshot.selection.join(",")}:${request?.token ?? "manual"}`}
      engine={engine}
      services={services}
      run={run}
      category={category}
      page={page}
      layer={layer}
      assets={snapshot.project.assets}
      previewKey={previewKey}
      selectionCount={snapshot.selection.length}
      requestedEffectId={request?.effectId}
    />
  );
}
function OwnedEditor({
  engine,
  services,
  run,
  category,
  page,
  layer,
  assets,
  previewKey,
  selectionCount,
  requestedEffectId,
}: StudioEffectsProps & {
  category: EffectCategory;
  page: Composition;
  layer?: Layer;
  assets: Project["assets"];
  previewKey: string;
  selectionCount: number;
  requestedEffectId?: string;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<"catalog" | "stack">(requestedEffectId ? "stack" : "catalog");
  const [expanded, setExpanded] = useState(
    requestedEffectId ?? (layer?.effects ?? page.effects ?? []).at(-1)?.id ?? "",
  );
  const local = useLayerPreview(engine, page, layer ? [layer.id] : [], run, true);
  const whole = useCompositionEffects(engine, page, run);
  const effects = layer?.effects ?? page.effects ?? [];
  const disabled =
    (layer ? !layerSelection(page, [layer.id]).editable : false) || selectionCount > 1;
  const editor = layer ? local : whole;
  function change(next: Effect[], preview = false) {
    if (disabled) return;
    if (!layer) whole.change(next, preview);
    else if (preview) local.previewLayer({ effects: next });
    else local.commit({ effects: next });
  }
  function update(effect: Effect, patch: Partial<Effect>, preview = false) {
    if (layer && !disabled) {
      if (preview) local.previewEffect(effect.id, patch);
      else local.commitEffect(effect.id, patch);
    } else
      change(
        effects.map((item) => (item.id === effect.id ? { ...item, ...patch } : item)),
        preview,
      );
  }
  return (
    <MotionFieldProvider editor={editor}>
      <div
        className="studio-effects-owner"
        role="group"
        aria-label={t(layer ? "studioEffects:layerScope" : "studioEffects:compositionScope")}
      >
        {layer && (
          <LayerThumbnail
            layer={layer}
            asset={layer.assetId ? assets[layer.assetId] : undefined}
            services={services}
            previewKey={previewKey}
            pageId={page.id}
          />
        )}
        <strong>{layer?.name ?? t("studioEffects:composition")}</strong>
      </div>
      {disabled && (
        <p className="muted-description">
          {t(selectionCount > 1 ? "studioEffects:singleSelection" : "studioEffects:locked")}
        </p>
      )}
      <div className="studio-effects-navigation">
        <Button
          size="sm"
          variant={view === "catalog" ? "secondary" : "ghost"}
          onClick={() => setView("catalog")}
        >
          <Plus size={13} />
          {t(category === "effect" ? "studioEffects:addEffect" : "studioEffects:addGrade")}
        </Button>
        <Button
          size="sm"
          variant={view === "stack" ? "secondary" : "ghost"}
          onClick={() => setView("stack")}
        >
          {t("studioEffects:stack", { count: effects.length })}
        </Button>
      </div>
      {view === "catalog" ? (
        <StudioEffectCatalog
          category={category}
          owner={{
            scope: layer ? "layer" : "composition",
            depthAvailable: ownerHasDepth(page, layer?.id),
          }}
          disabled={disabled || effects.length >= 64}
          onAdd={(type) => {
            const effect = createEffect(type);
            change([...effects, effect]);
            setExpanded(effect.id);
            setView("stack");
          }}
        />
      ) : (
        <ScrollShadow className="studio-effects-scroll">
          <div className="studio-effects-stack">
            {!effects.length && <p className="muted-description">{t("noEffects")}</p>}
            <EffectStack
              effects={effects}
              engine={engine}
              layerId={layer?.id}
              disabled={disabled}
              value={expanded}
              onValueChange={setExpanded}
              onUpdate={update}
              onChange={change}
              onStart={editor.begin}
              onCancel={editor.cancel}
            />
          </div>
        </ScrollShadow>
      )}
    </MotionFieldProvider>
  );
}
