import {
  getEffectDefinition,
  type Composition,
  type EnginePort,
  type Layer,
  type Project,
} from "@musart/core";
import { ScanLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../../state/contracts";
import { attachmentSelection, type AttachmentTarget } from "../../../state/selection/attachments";
import { Button } from "../../ui/button";
import { LayerThumbnail } from "../rows/LayerThumbnail";
import { EffectPopover } from "./EffectPopover";
import { MaskPopover } from "./MaskPopover";
import { sameLayerContainer } from "../tree/activation";
import { useAttachmentPagePort, type AttachmentPagePort } from "./attachment-page";
import { useRowAction } from "../rows/use-row-action";
import "../messages";
import { memo, type CSSProperties } from "react";
/** At most two actual effect previews and one actual mask; full children remain behind the chevron. */
export const AttachmentCards = memo(
  function AttachmentCards({
    engine,
    page,
    layer,
    assets,
    services,
    previewKey,
    target,
    onExpand,
    run,
  }: {
    engine: EnginePort;
    page: Composition;
    layer: Layer;
    assets: Project["assets"];
    services?: Pick<EditorServices, "previewExport">;
    previewKey: string;
    target: AttachmentTarget | null;
    onExpand: () => void;
    run: (action: () => void) => void;
  }) {
    const pagePort = useAttachmentPagePort(engine, page, layer.id);
    const expand = useRowAction(onExpand);
    return (
      <CardContents
        engine={engine}
        page={target?.pageId === page.id && target.layerId === layer.id ? page : undefined}
        pagePort={pagePort}
        layer={layer}
        assets={assets}
        services={services}
        previewKey={previewKey}
        target={target}
        onExpand={expand}
        run={run}
      />
    );
  },
  (before, after) =>
    before.engine === after.engine &&
    sameLayerContainer(before.page, after.page) &&
    before.layer === after.layer &&
    before.assets === after.assets &&
    before.services === after.services &&
    before.previewKey === after.previewKey &&
    before.target === after.target &&
    before.onExpand === after.onExpand &&
    before.run === after.run,
);

/** Only the selected attachment carries a live page; unchanged closed siblings retain their leaves. */
const CardContents = memo(function CardContents({
  engine,
  page,
  pagePort,
  layer,
  assets,
  services,
  previewKey,
  target,
  onExpand,
  run,
}: {
  engine: EnginePort;
  page?: Composition;
  pagePort: AttachmentPagePort;
  layer: Layer;
  assets: Project["assets"];
  services?: Pick<EditorServices, "previewExport">;
  previewKey: string;
  target: AttachmentTarget | null;
  onExpand: () => void;
  run: (action: () => void) => void;
}) {
  const { t } = useTranslation();
  const visibleEffects = layer.effects.filter(
    (effect) => !getEffectDefinition(effect.type).retired,
  );
  const effects = visibleEffects.slice(-2),
    selected =
      target?.kind === "effect"
        ? visibleEffects.find((effect) => effect.id === target.effectId)
        : undefined;
  if (selected && !effects.some((effect) => effect.id === selected.id)) effects[0] = selected;
  const more = visibleEffects.length - effects.length;
  return (
    <div
      className="layer-attachment-cards"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {effects.map((effect, index) => {
        const active = target?.kind === "effect" && target.effectId === effect.id,
          select = () => {
            const current = pagePort.read();
            if (current)
              attachmentSelection(engine).select(current, {
                kind: "effect",
                pageId: pagePort.pageId,
                layerId: layer.id,
                effectId: effect.id,
              });
          };
        return (
          <EffectPopover
            key={index}
            engine={engine}
            page={page}
            pagePort={pagePort}
            layer={layer}
            effectId={effect.id}
            run={run}
          >
            <Button
              variant="ghost"
              size="icon-xs"
              className={`layer-attachment-avatar attachment-thumbnail-card ${active ? "is-selected" : ""}`}
              style={{ "--card-order": index + 1 } as CSSProperties}
              aria-label={`${t(getEffectDefinition(effect.type).nameKey)} · ${layer.name}`}
              aria-pressed={active}
              data-attachment-tooltip={t(getEffectDefinition(effect.type).nameKey)}
              data-attachment-target="effect"
              data-attachment-effect-id={effect.id}
              onContextMenu={select}
            >
              <LayerThumbnail
                layer={layer}
                asset={layer.assetId ? assets[layer.assetId] : undefined}
                services={services}
                previewKey={previewKey}
                pageId={pagePort.pageId}
                variant={{ kind: "effect", effectId: effect.id }}
              />
              <span className="attachment-card-kind" aria-hidden="true">
                fx
              </span>
            </Button>
          </EffectPopover>
        );
      })}
      {layer.mask && (
        <MaskPopover engine={engine} page={page} pagePort={pagePort} layer={layer} run={run}>
          <Button
            variant="ghost"
            size="icon-xs"
            className={`layer-attachment-avatar attachment-thumbnail-card ${target?.kind === "mask" ? "is-selected" : ""}`}
            style={{ "--card-order": 3 } as CSSProperties}
            aria-label={`${t("mask")} · ${layer.name}`}
            aria-pressed={target?.kind === "mask"}
            data-attachment-tooltip={t("mask")}
            data-attachment-target="mask"
            onContextMenu={() => {
              const current = pagePort.read();
              if (current)
                attachmentSelection(engine).select(current, {
                  kind: "mask",
                  pageId: pagePort.pageId,
                  layerId: layer.id,
                });
            }}
          >
            <LayerThumbnail
              layer={layer}
              asset={layer.assetId ? assets[layer.assetId] : undefined}
              services={services}
              previewKey={previewKey}
              pageId={pagePort.pageId}
              variant={{ kind: "mask" }}
            />
            <span className="attachment-card-kind" aria-hidden="true">
              <ScanLine size={8} />
            </span>
          </Button>
        </MaskPopover>
      )}
      {more > 0 && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="attachment-more-count"
          aria-label={t("layerControls:moreEffects", { count: more })}
          onClick={onExpand}
        >
          +{more}
        </Button>
      )}
    </div>
  );
});
