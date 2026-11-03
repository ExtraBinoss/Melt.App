import { useCallback, useLayoutEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  createLayerGeometryIndex,
  type Composition,
  type EnginePort,
  type Layer,
} from "@musart/core";
import { Popover, PopoverAnchor, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { MaskProperties } from "../../properties/MaskProperties";
import { useLayerPreview } from "../controls/use-layer-preview";
import { Button } from "../../ui/button";
import { activateLayerPage, resolveLayerPage } from "../tree/activation";
import { useAttachmentPage, type AttachmentPageInput } from "./attachment-page";
import { attachmentSelection } from "../../../state/selection/attachments";
import { attachmentDeleteKey } from "../../../state/selection/attachment-keydown";
import "../messages";
import { LockedLayerNotice } from "../../properties/locked/LockedLayerNotice";
import { usePopoverOwner } from "./use-popover-owner";
import { useLayerPopoverAnchor } from "./use-layer-popover-anchor";
import { resolvePageEditingScope } from "../../../state/session/page-editing-scope";
export function MaskPopover({
  engine,
  page,
  pagePort,
  layer,
  run,
  children,
}: {
  engine: EnginePort;
  layer: Layer;
  run: (task: () => void) => void;
  children: ReactNode;
} & AttachmentPageInput) {
  const { t } = useTranslation();
  const ownerKey = JSON.stringify([
    engine.getSnapshot().project.id,
    pagePort?.pageId ?? page!.id,
    layer.id,
  ]);
  const owner = usePopoverOwner(ownerKey);
  const { open: ownerOpen, onOpenChange: setOwnerOpen, isCurrent: isOwnerCurrent } = owner;
  const { trigger, virtualRef } = useLayerPopoverAnchor(ownerKey);
  const {
    source: ownedPage,
    current: currentPage,
    capture,
  } = useAttachmentPage(engine, page, pagePort, ownerOpen);
  const isCurrent = useCallback(
    () => Boolean(ownedPage && isOwnerCurrent() && resolveLayerPage(engine, ownedPage)),
    [engine, ownedPage, isOwnerCurrent],
  );
  useLayoutEffect(() => {
    if (ownerOpen && !currentPage) setOwnerOpen(false);
  }, [ownerOpen, setOwnerOpen, currentPage]);
  const runCurrent = (task: () => void) => {
    const snapshot = engine.getSnapshot();
    if (isCurrent())
      run(() => {
        if (isCurrent() && engine.getSnapshot() === snapshot) task();
      });
  };
  return (
    <Popover
      open={owner.open}
      onOpenChange={(open) => {
        const current = open ? capture() : null;
        if (open && !current) return;
        if (!owner.onOpenChange(open)) return;
        if (open && current)
          attachmentSelection(engine).select(current, {
            kind: "mask",
            pageId: current.id,
            layerId: layer.id,
          });
      }}
    >
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverTrigger ref={trigger} asChild onPointerDownCapture={owner.onTriggerPointerDown}>
        {children}
      </PopoverTrigger>
      {owner.present && ownedPage && (
        <PopoverContent
          portalContainer={document.body}
          initialFocus="content"
          onCloseAutoFocus={owner.onCloseAutoFocus}
          side="left"
          align="start"
          className="floating-panel layer-attachment-popover"
          aria-label={`${t("mask")} · ${layer.name}`}
          onKeyDown={(event) => {
            if (isCurrent() && attachmentDeleteKey(event.nativeEvent, engine, runCurrent)) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          <ScrollShadow key={owner.generation} className="layer-attachment-scroll">
            <div className="layer-attachment-viewport">
              <MaskDetails
                key={owner.generation}
                engine={engine}
                page={currentPage ?? ownedPage}
                layer={layer}
                run={run}
                isCurrent={isCurrent}
                registerDeactivate={owner.registerDeactivate}
              />
            </div>
          </ScrollShadow>
        </PopoverContent>
      )}
    </Popover>
  );
}
function MaskDetails({
  engine,
  page,
  layer,
  run,
  isCurrent,
  registerDeactivate,
}: {
  engine: EnginePort;
  page: Composition;
  layer: Layer;
  run: (task: () => void) => void;
  isCurrent: () => boolean;
  registerDeactivate: (cancel: () => void) => () => void;
}) {
  const { t } = useTranslation();
  const runCurrent = (task: () => void) => {
    const snapshot = engine.getSnapshot();
    if (isCurrent())
      run(() => {
        if (isCurrent() && engine.getSnapshot() === snapshot) task();
      });
  };
  const resolve = useCallback(() => resolvePageEditingScope(engine, page), [engine, page]);
  const edit = useLayerPreview(engine, page, [layer.id], runCurrent, false, resolve);
  useLayoutEffect(() => registerDeactivate(edit.cancel), [edit.cancel, registerDeactivate]);
  return (
    <>
      <LockedLayerNotice engine={engine} page={page} layers={[layer]} run={runCurrent} />
      {layer.mask?.layerId && (
        <Button
          variant="ghost"
          className="mask-source-navigation"
          onClick={() => {
            if (isCurrent() && activateLayerPage(engine, page) && layer.mask?.layerId)
              engine.select([layer.mask.layerId]);
          }}
        >
          {t("layerControls:selectMaskSource")}
        </Button>
      )}
      <MaskProperties
        engine={engine}
        layer={layer}
        run={runCurrent}
        onCommand={(command) => {
          const current = resolveLayerPage(engine, page);
          if (isCurrent() && current) {
            edit.beginOnPage(current);
            edit.command(command);
          }
        }}
        disabled={createLayerGeometryIndex(page).isLocked(layer.id)}
      />
    </>
  );
}
