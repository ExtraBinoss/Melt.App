import type { DragEvent } from "react";
import { ChevronRight, Eye, EyeOff, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getEffectDefinition, type Composition, type EnginePort } from "@musart/core";
import { Button } from "../../ui/button";
import { IconButton } from "../../shared/IconButton";
import { useCompositionEffects } from "../controls/use-composition-effects";
import { activateLayerPage } from "../tree/activation";
import { CompositionEffectPopover } from "./CompositionEffectPopover";
import { compositionEffectDeleteKey } from "./delete-key";
import "./composition-effects.css";

interface Props {
  engine: EnginePort;
  page: Composition;
  top: number;
  run: (task: () => void) => void;
  onDragReject?: (event: DragEvent<HTMLElement>) => void;
}
const position = (top: number, depth: number) => ({
  position: "absolute" as const,
  top,
  left: 0,
  right: 0,
  paddingLeft: 12 + depth * 16,
});

/** An actual composition stack, represented in the tree without inventing a document layer. */
export function CompositionEffectsRow({
  engine,
  page,
  top,
  expanded,
  onToggle,
  run,
  onDragReject,
}: Props & {
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const edit = useCompositionEffects(engine, page, run);
  const effects = page.effects ?? [];
  const enabled = effects.some((effect) => effect.enabled);
  const label = `${t("composition")} · ${t("effects")}`;
  return (
    <div
      role="treeitem"
      aria-level={2}
      aria-expanded={expanded}
      aria-label={label}
      tabIndex={0}
      data-composition-effects={page.id}
      data-layer-tree-key={`composition-effects:${page.id}`}
      className={`layer-attachment-row layer-composition-effects ${enabled ? "" : "is-hidden"}`}
      style={position(top, 1)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if ((event.key === "ArrowLeft" && expanded) || (event.key === "ArrowRight" && !expanded)) {
          event.preventDefault();
          onToggle(page.id);
        }
      }}
      onDragEnter={(event) => {
        event.stopPropagation();
        onDragReject?.(event);
      }}
      onDragOver={(event) => {
        event.stopPropagation();
        onDragReject?.(event);
      }}
      onDrop={(event) => {
        event.stopPropagation();
        onDragReject?.(event);
      }}
    >
      <IconButton
        label={t(`layerControls:${expanded ? "collapseArtboard" : "expandArtboard"}`, {
          name: label,
        })}
        onClick={() => onToggle(page.id)}
      >
        <ChevronRight size={12} className="layer-chevron-icon" data-expanded={expanded} />
      </IconButton>
      <Sparkles size={13} aria-hidden="true" />
      <span className="layer-name">{label}</span>
      <span className="small-count">{effects.length}</span>
      <div className="attachment-actions">
        <IconButton
          label={`${t(enabled ? "disableEffect" : "enableEffect")} · ${label}`}
          onClick={() => {
            if (activateLayerPage(engine, page))
              edit.change(effects.map((effect) => ({ ...effect, enabled: !enabled })));
          }}
        >
          {enabled ? <Eye size={12} /> : <EyeOff size={12} />}
        </IconButton>
      </div>
    </div>
  );
}

export function CompositionEffectRow({
  engine,
  page,
  effectId,
  top,
  run,
  onDragReject,
}: Props & { effectId: string }) {
  const { t } = useTranslation();
  const edit = useCompositionEffects(engine, page, run);
  const effects = page.effects ?? [];
  const effect = effects.find((item) => item.id === effectId);
  if (!effect) return null;
  const label = t(getEffectDefinition(effect.type).nameKey);
  return (
    <div
      role="treeitem"
      aria-level={3}
      aria-label={label}
      data-composition-effect-id={effect.id}
      data-layer-tree-key={`composition-effect:${page.id.length}:${page.id}:${effect.id}`}
      className={`layer-attachment-row ${effect.enabled ? "" : "is-hidden"}`}
      style={position(top, 2)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) =>
        compositionEffectDeleteKey(event, () => {
          if (activateLayerPage(engine, page))
            edit.change(effects.filter((item) => item.id !== effect.id));
        })
      }
      onDragEnter={(event) => {
        event.stopPropagation();
        onDragReject?.(event);
      }}
      onDragOver={(event) => {
        event.stopPropagation();
        onDragReject?.(event);
      }}
      onDrop={(event) => {
        event.stopPropagation();
        onDragReject?.(event);
      }}
    >
      <CompositionEffectPopover engine={engine} page={page} effectId={effect.id} run={run}>
        <Button variant="ghost" className="attachment-name" data-attachment-tooltip={label}>
          <span className="effect-avatar">fx</span>
          {label}
        </Button>
      </CompositionEffectPopover>
      <div className="attachment-actions">
        <IconButton
          label={t(effect.enabled ? "disableEffect" : "enableEffect")}
          onClick={() => {
            if (activateLayerPage(engine, page))
              edit.change(
                effects.map((item) =>
                  item.id === effect.id ? { ...item, enabled: !item.enabled } : item,
                ),
              );
          }}
        >
          {effect.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
        </IconButton>
        <IconButton
          label={t("removeEffect")}
          onClick={() => {
            if (activateLayerPage(engine, page))
              edit.change(effects.filter((item) => item.id !== effect.id));
          }}
        >
          <Trash2 size={12} />
        </IconButton>
      </div>
    </div>
  );
}
