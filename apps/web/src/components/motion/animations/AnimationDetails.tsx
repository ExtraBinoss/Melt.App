import { AnimatedCollapsibleContent } from "../../shared/disclosure/AnimatedCollapsibleContent";
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  EnginePort,
  MotionAnimation,
  MotionAnimationPreset,
  SceneMotionAnimation,
  AnimationTarget,
  SceneAnimationTarget,
} from "@musart/core";
import { AnimationChannel } from "./AnimationChannel";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { Collapsible, CollapsibleTrigger } from "../../ui/collapsible";

/** Detail edits change the authoritative channels, never a generated duplicate keyframe set. */
export function AnimationDetails({
  engine,
  animation,
  run,
}: {
  engine: EnginePort;
  animation: MotionAnimation | SceneMotionAnimation;
  run: (action: () => void) => void;
}) {
  function edit(
    change: (preset: MotionAnimationPreset<AnimationTarget | SceneAnimationTarget>) => void,
  ) {
    run(() => {
      const preset = structuredClone(animation.preset);
      change(preset);
      engine.execute({
        type: "updateMotionAnimation",
        animationId: animation.id,
        patch: { preset },
      });
    });
  }
  return (
    <div className="animation-details">
      {animation.preset.channels.map((channel, index) => (
        <AnimationChannel
          key={`${channel.target.kind}:${channel.target.kind === "effect" || channel.target.kind === "effectSetting" ? channel.target.slot : ""}:${channel.target.property}`}
          animation={animation}
          channel={channel}
          index={index}
          edit={edit}
        />
      ))}
    </div>
  );
}

export function AnimationDetailsDisclosure({
  engine,
  animation,
  run,
  disabled,
  actions,
  open: controlledOpen,
  onOpenChange,
}: {
  engine: EnginePort;
  animation: MotionAnimation | SceneMotionAnimation;
  run: (action: () => void) => void;
  disabled: boolean;
  actions?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation("animations");
  const [localOpen, setOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  return (
    <Collapsible
      className="animation-details-disclosure"
      open={open}
      onOpenChange={onOpenChange ?? setOpen}
    >
      <div className="animation-instance-footer">
        <div className="animation-details-label">
          <CollapsibleTrigger asChild>
            <button type="button" className="animation-details-toggle animation-disclosure-trigger">
              <ChevronRight size={12} />
              {t("details")}
            </button>
          </CollapsibleTrigger>
          <InfoTooltip label={t("detailsHelp")}>{t("detailsHint")}</InfoTooltip>
        </div>
        {actions}
      </div>
      <AnimatedCollapsibleContent open={open} className="animation-disclosure">
        <fieldset disabled={disabled}>
          <AnimationDetails engine={engine} animation={animation} run={run} />
        </fieldset>
      </AnimatedCollapsibleContent>
    </Collapsible>
  );
}
