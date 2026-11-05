import { useLayoutEffect, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getEffectDefinition, type Composition, type Effect, type EnginePort } from "@musart/core";
import { Popover, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { IconButton } from "../../shared/IconButton";
import { EffectParameters } from "../../properties/effects/EffectParameters";
import { MotionFieldProvider } from "../../properties/motion/context";
import { useCompositionEffects } from "../controls/use-composition-effects";
import { usePopoverOwner } from "../attachments/use-popover-owner";
import { activateLayerPage } from "../tree/activation";
import { compositionEffectDeleteKey } from "./delete-key";
import { useCompositionEffectMotionRequest } from "../../motion/scene/effect-navigation";
import { useWorkspaceMode } from "../../../ui/studio/workspace-mode";
import { freezeEffectPreviews } from "../../../state/session/effect-preview";

interface Props {
  engine: EnginePort;
  page: Composition;
  effectId: string;
  run: (task: () => void) => void;
}

/** The shared attachment owner retires drafts before another layer/effect popover opens. */
export function CompositionEffectPopover({
  engine,
  page,
  effectId,
  run,
  children,
}: Props & { children: ReactNode }) {
  const { t } = useTranslation();
  const owner = usePopoverOwner(
    JSON.stringify([engine.getSnapshot().project.id, page.id, "composition-effect", effectId]),
  );
  const workspace = useWorkspaceMode();
  useCompositionEffectMotionRequest(engine, (request) => {
    if (
      workspace === "classic" &&
      request.pageId === page.id &&
      request.effectId === effectId &&
      activateLayerPage(engine, page)
    )
      owner.onOpenChange(true);
  });
  const effect = page.effects?.find((item) => item.id === effectId);
  return (
    <Popover
      modal={false}
      open={owner.open}
      onOpenChange={(open) => {
        if (open && !activateLayerPage(engine, page)) return;
        owner.onOpenChange(open);
      }}
    >
      <PopoverTrigger asChild onPointerDownCapture={owner.onTriggerPointerDown}>
        {children}
      </PopoverTrigger>
      {owner.present && effect && (
        <PopoverContent
          side="left"
          align="start"
          initialFocus="content"
          className="floating-panel composition-effect-popover"
          onCloseAutoFocus={owner.onCloseAutoFocus}
          aria-label={`${t("composition")} · ${t(getEffectDefinition(effect.type).nameKey)}`}
          data-composition-effect-controls={effect.id}
        >
          <CompositionEffectDetails
            key={owner.generation}
            engine={engine}
            page={page}
            effectId={effectId}
            run={run}
            isCurrent={owner.isCurrent}
            registerDeactivate={owner.registerDeactivate}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}

function CompositionEffectDetails({
  engine,
  page,
  effectId,
  run,
  isCurrent,
  registerDeactivate,
}: Props & {
  isCurrent: () => boolean;
  registerDeactivate: (cancel: () => void) => () => void;
}) {
  const { t } = useTranslation();
  const edit = useCompositionEffects(engine, page, (task) => {
    if (isCurrent())
      run(() => {
        if (isCurrent()) task();
      });
  });
  const cancel = edit.cancel;
  useLayoutEffect(
    () =>
      registerDeactivate(() => {
        freezeEffectPreviews(engine, false);
        cancel();
      }),
    [engine, registerDeactivate, cancel],
  );
  const effects = page.effects ?? [],
    index = effects.findIndex((item) => item.id === effectId),
    effect = effects[index];
  if (!effect) return null;
  const update = (patch: Partial<Effect>, preview = false) => {
    if (isCurrent())
      edit.change(
        effects.map((item) => (item.id === effectId ? { ...item, ...patch } : item)),
        preview,
      );
  };
  const move = (direction: -1 | 1) => {
    if (!isCurrent() || index + direction < 0 || index + direction >= effects.length) return;
    const next = [...effects];
    next.splice(index + direction, 0, next.splice(index, 1)[0]!);
    edit.change(next);
  };
  return (
    <MotionFieldProvider editor={edit}>
      <div
        className="composition-effect-details"
        onKeyDown={(event) =>
          compositionEffectDeleteKey(event, () => {
            if (isCurrent()) edit.change(effects.filter((item) => item.id !== effectId));
          })
        }
      >
        <div className="section-title">
          <h3>{t(getEffectDefinition(effect.type).nameKey)}</h3>
          <div className="attachment-actions">
            <IconButton
              label={t(effect.enabled ? "disableEffect" : "enableEffect")}
              onClick={() => update({ enabled: !effect.enabled })}
            >
              {effect.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
            </IconButton>
            <IconButton label={t("moveEffectUp")} disabled={!index} onClick={() => move(-1)}>
              <ArrowUp size={13} />
            </IconButton>
            <IconButton
              label={t("moveEffectDown")}
              disabled={index === effects.length - 1}
              onClick={() => move(1)}
            >
              <ArrowDown size={13} />
            </IconButton>
            <IconButton
              label={t("removeEffect")}
              onClick={() => {
                if (isCurrent()) edit.change(effects.filter((item) => item.id !== effectId));
              }}
            >
              <Trash2 size={13} />
            </IconButton>
          </div>
        </div>
        <EffectParameters
          engine={engine}
          effect={effect}
          onStart={edit.begin}
          onChange={update}
          onCancel={cancel}
        />
      </div>
    </MotionFieldProvider>
  );
}
