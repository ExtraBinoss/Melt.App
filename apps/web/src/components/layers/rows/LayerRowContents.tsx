import "../../../services/selection/wand/messages";
import { memo, type RefObject } from "react";
import { ChevronRight, ScanLine, CornerDownRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getEffectDefinition,
  type Composition,
  type EnginePort,
  type Layer,
  type Project,
} from "@musart/core";
import type { EditorServices } from "../../../state/contracts";
import type { AttachmentTarget } from "../../../state/selection/attachments";
import type { LayerDropPosition } from "../drop-target";
import type { LayerDropRejection } from "../drag/validation";
import { Input } from "../../ui/input";
import { LayerThumbnail } from "./LayerThumbnail";
import { LayerRowActions } from "./LayerRowActions";
import { AttachmentCards } from "../attachments/AttachmentCards";
import { DropCue } from "../drag/DropCue";
import "../messages";

/** Selection and page metadata leave static controls intact; row callbacks resolve canonical owners. */
export const LayerRowContents = memo(
  function LayerRowContents({
    engine,
    page,
    layer,
    assets,
    services,
    previewKey,
    attachmentTarget,
    expanded,
    renaming,
    parentLocked,
    locked,
    lockDescription,
    drop,
    rejected,
    anchor,
    run,
    onToggle,
    onExpand,
    onRename,
    onCancelRename,
    onLock,
    onVisibility,
  }: {
    engine: EnginePort;
    page: Composition;
    layer: Layer;
    assets: Project["assets"];
    services?: Pick<EditorServices, "previewExport">;
    previewKey: string;
    attachmentTarget: AttachmentTarget | null;
    expanded: boolean;
    renaming: boolean;
    parentLocked: boolean;
    locked: boolean;
    lockDescription: string;
    drop?: LayerDropPosition;
    rejected?: LayerDropRejection;
    anchor: RefObject<HTMLDivElement | null>;
    run: (task: () => void) => void;
    onToggle: () => void;
    onExpand: () => void;
    onRename: (name: string) => void;
    onCancelRename: () => void;
    onLock: () => void;
    onVisibility: () => void;
  }) {
    const { t } = useTranslation();
    const expandable =
      layer.kind === "group" ||
      layer.effects.some((effect) => !getEffectDefinition(effect.type).retired) ||
      !!layer.mask;
    return (
      <>
        {expandable && (
          <button
            className="group-chevron"
            aria-label={layer.name}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <ChevronRight size={12} className="layer-chevron-icon" data-expanded={expanded} />
          </button>
        )}
        <LayerThumbnail
          layer={layer}
          asset={layer.assetId ? assets[layer.assetId] : undefined}
          services={services}
          previewKey={previewKey}
          pageId={page.id}
        />
        {renaming ? (
          <Input
            autoFocus
            className="layer-name-input"
            aria-label={t("renameLayer")}
            defaultValue={layer.name}
            onClick={(event) => event.stopPropagation()}
            onBlur={(event) => onRename(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") onRename(event.currentTarget.value);
              if (event.key === "Escape") onCancelRename();
            }}
          />
        ) : (
          <span className="layer-name">{layer.name}</span>
        )}
        {layer.clipping && (
          <span
            className="mask-indicator"
            title={t("pixelSelection:clippingHint")}
            aria-label={t("pixelSelection:toggleClipping")}
          >
            <CornerDownRight size={12} />
          </span>
        )}
        {layer.maskSource && (
          <span className="mask-indicator" aria-label={t("maskSource")}>
            <ScanLine size={12} />
          </span>
        )}
        {(layer.effects.length > 0 || layer.mask) && (
          <AttachmentCards
            engine={engine}
            page={page}
            layer={layer}
            assets={assets}
            services={services}
            previewKey={previewKey}
            target={attachmentTarget}
            onExpand={onExpand}
            run={run}
          />
        )}
        {(drop || rejected) && <DropCue anchor={anchor} position={drop} reason={rejected} />}
        <LayerRowActions
          name={layer.name}
          visible={layer.visible}
          ownLocked={layer.locked}
          parentLocked={parentLocked}
          locked={locked}
          lockDescription={lockDescription}
          onLock={onLock}
          onVisibility={onVisibility}
        />
      </>
    );
  },
  (before, after) => {
    const keys = Object.keys(before) as (keyof typeof before)[];
    return (
      keys.length === Object.keys(after).length &&
      keys.every((key) => {
        if (key !== "page") return Object.is(before[key], after[key]);
        // Attachment editors own a strict page scope. Plain row contents only read its ID;
        // the parent row still refreshes canonical guards and layout-committed callbacks.
        return (
          before.page === after.page ||
          (before.page.id === after.page.id &&
            before.layer.effects.length === 0 &&
            !before.layer.mask &&
            after.layer.effects.length === 0 &&
            !after.layer.mask)
        );
      })
    );
  },
);
