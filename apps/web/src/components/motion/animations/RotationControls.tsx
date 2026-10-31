import { useTranslation } from "react-i18next";
import type { EnginePort, MotionAnimation } from "@musart/core";
import { NumberInput } from "../../shared/NumberInput";
import "./messages";

/** A simple turns control for any two-point, constant-speed additive rotation recipe. */
export function rotationTurns(animation: MotionAnimation): number | null {
  const channel = animation.preset.channels[0];
  if (
    animation.preset.channels.length !== 1 ||
    !channel ||
    channel.target.kind !== "layer" ||
    channel.target.property !== "rotation" ||
    channel.operation !== "add" ||
    channel.points.length !== 2 ||
    typeof channel.points[0]!.value !== "number" ||
    typeof channel.points[1]!.value !== "number" ||
    channel.points.some((point) => point.easing?.type !== "linear")
  )
    return null;
  return ((channel.points[1]!.value - channel.points[0]!.value) * animation.strength) / 360;
}

export function RotationControls({
  engine,
  animation,
  disabled,
  run,
}: {
  engine: EnginePort;
  animation: MotionAnimation;
  disabled: boolean;
  run(this: void, action: () => void): void;
}) {
  const { t } = useTranslation("animations");
  const turns = rotationTurns(animation);
  if (turns === null) return null;
  return (
    <NumberInput
      label={t("turns")}
      identity={animation}
      value={Math.abs(turns)}
      min={0}
      max={1000}
      disabled={disabled}
      onCommit={(value) =>
        run(() => {
          const preset = structuredClone(animation.preset);
          const points = preset.channels[0]!.points;
          const direction = Number(points[1]!.value) < Number(points[0]!.value) ? -1 : 1;
          points[0]!.value = Number(points[0]!.value) * animation.strength;
          points[1]!.value = points[0]!.value + value * 360 * direction;
          engine.execute({
            type: "updateMotionAnimation",
            animationId: animation.id,
            patch: { preset, strength: 1 },
          });
        })
      }
    />
  );
}
