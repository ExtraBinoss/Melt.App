import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createEffect,
  getEffectDefinition,
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
import { EffectParameters } from "../../../components/properties/effects/EffectParameters";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { IconButton } from "../../../components/shared/IconButton";
import { compositionHasDepth, type EffectCategory } from "../../../components/layers/catalog/model";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../../../components/ui/accordion";
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
        <IconButton label={label} tooltipSide="bottom" data-studio-effect-category={category}>
          <Icon size={15} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        className="studio-effects-popover"
        side="bottom"
        align="center"
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
  const [expanded, setExpanded] = useState<string[]>(
    requestedEffectId
      ? [requestedEffectId]
      : (layer?.effects ?? page.effects ?? []).slice(-1).map((effect) => effect.id),
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
  function move(index: number, direction: -1 | 1) {
    const next = [...effects];
    next.splice(index + direction, 0, next.splice(index, 1)[0]!);
    change(next);
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
            depthAvailable: !layer && compositionHasDepth(page),
          }}
          disabled={disabled || effects.length >= 64}
          onAdd={(type) => {
            change([...effects, createEffect(type)]);
            setView("stack");
          }}
        />
      ) : (
        <Accordion
          type="multiple"
          value={expanded}
          onValueChange={setExpanded}
          className="studio-effects-stack"
        >
          {!effects.length && <p className="muted-description">{t("noEffects")}</p>}
          {effects.map((effect, index) => (
            <AccordionItem key={effect.id} className="studio-effect-card" value={effect.id}>
              <AccordionTrigger>{t(getEffectDefinition(effect.type).nameKey)}</AccordionTrigger>
              <AccordionContent>
                <div className="studio-effect-actions">
                  <Switch
                    checked={effect.enabled}
                    disabled={disabled}
                    aria-label={t(effect.enabled ? "disableEffect" : "enableEffect")}
                    onCheckedChange={(enabled) => update(effect, { enabled })}
                  />
                  <IconButton
                    label={t("moveEffectUp")}
                    disabled={disabled || !index}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={13} />
                  </IconButton>
                  <IconButton
                    label={t("moveEffectDown")}
                    disabled={disabled || index === effects.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={13} />
                  </IconButton>
                  <IconButton
                    label={t("removeEffect")}
                    disabled={disabled}
                    onClick={() => change(effects.filter((item) => item.id !== effect.id))}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
                <EffectParameters
                  engine={engine}
                  layerId={layer?.id}
                  effect={effect}
                  disabled={disabled}
                  onStart={editor.begin}
                  onChange={(patch, preview) => update(effect, patch, preview)}
                  onCancel={editor.cancel}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </MotionFieldProvider>
  );
}
