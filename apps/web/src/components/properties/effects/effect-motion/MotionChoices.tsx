import {
  Activity,
  Check,
  Hand,
  MousePointerClick,
  Move,
  MoveHorizontal,
  MoveVertical,
  Repeat2,
  ArrowLeftRight,
} from "lucide-react";
import type { MotionInputKind } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../ui/tooltip";

const automatic = [
  { kind: "loop", Icon: Repeat2 },
  { kind: "pingPong", Icon: ArrowLeftRight },
  { kind: "pulse", Icon: Activity },
] as const;
const interactive = [
  { kind: "pointerX", Icon: MoveHorizontal },
  { kind: "pointerY", Icon: MoveVertical },
  { kind: "pointerXY", Icon: Move },
  { kind: "pointerDrag", Icon: Hand },
  { kind: "primaryClick", Icon: MousePointerClick },
] as const;

/** Each tile performs one action immediately; detailed authoring is optional. */
export function MotionChoices({
  disabled,
  recording,
  activeAutomatic,
  activeInteractive,
  onAutomatic,
  onInput,
}: {
  disabled: boolean;
  recording: boolean;
  activeAutomatic?: string;
  activeInteractive?: string;
  onAutomatic(this: void, kind: "loop" | "pingPong" | "pulse"): void;
  onInput(this: void, kind: MotionInputKind): void;
}) {
  const { t } = useTranslation("effectMotion");
  return (
    <>
      <div className="effect-motion-choice-group">
        <span className="effect-motion-heading">{t("automatic")}</span>
        <div className="effect-motion-choices">
          {automatic.map(({ kind, Icon }) => (
            <Tooltip key={kind}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="effect-motion-choice"
                  disabled={disabled || recording}
                  aria-pressed={activeAutomatic === kind}
                  onClick={() => onAutomatic(kind)}
                >
                  <Icon size={17} strokeWidth={1.6} aria-hidden />
                  <span>{t(kind)}</span>
                  {activeAutomatic === kind && (
                    <Check className="effect-motion-checked" size={10} aria-hidden />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t(`${kind}Hint`)}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <div className="effect-motion-choice-group">
        <span className="effect-motion-heading">{t("interactive")}</span>
        <div className="effect-motion-choices">
          {interactive.map(({ kind, Icon }) => (
            <Tooltip key={kind}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="effect-motion-choice"
                  disabled={disabled || recording}
                  aria-pressed={
                    activeInteractive === kind ||
                    (kind === "primaryClick" && activeInteractive === "secondaryClick")
                  }
                  onClick={() => onInput(kind)}
                >
                  <Icon size={17} strokeWidth={1.6} aria-hidden />
                  <span>{t(`quick.${kind}`)}</span>
                  {(activeInteractive === kind ||
                    (kind === "primaryClick" && activeInteractive === "secondaryClick")) && (
                    <Check className="effect-motion-checked" size={10} aria-hidden />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t(`${kind}Hint`)}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </>
  );
}
