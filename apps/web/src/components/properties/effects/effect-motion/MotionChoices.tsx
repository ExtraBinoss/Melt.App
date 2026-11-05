import {
  Activity,
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
  input,
  onAutomatic,
  onInput,
}: {
  disabled: boolean;
  recording: boolean;
  input: MotionInputKind;
  onAutomatic(kind: "loop" | "pingPong" | "pulse"): void;
  onInput(kind: MotionInputKind): void;
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
                  onClick={() => onAutomatic(kind)}
                >
                  <Icon size={21} strokeWidth={1.6} aria-hidden />
                  <span>{t(kind)}</span>
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
                  aria-pressed={recording && input === kind}
                  onClick={() => onInput(kind)}
                >
                  <Icon size={21} strokeWidth={1.6} aria-hidden />
                  <span>{t(`quick.${kind}`)}</span>
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
