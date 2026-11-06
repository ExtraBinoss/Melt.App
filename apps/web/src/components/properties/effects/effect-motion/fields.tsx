import { useContext } from "react";
import type { ComponentProps, ReactNode } from "react";
import type {
  EnginePort,
  MotionPropertyTarget,
  MotionValue,
  SceneMotionPropertyTarget,
} from "@musart/core";
import { MotionField } from "../../motion/MotionField";
import { MotionValueField } from "../../motion/MotionValueField";
import { MotionNumberInput } from "../../motion/MotionNumberInput";
import { useMotionFieldEditor } from "../../motion/context";
import { SceneMotionField } from "../../../spatial/SceneMotionField";
import { SceneMotionValue } from "../../../spatial/SceneMotionValue";
import { SceneNumberInput } from "../../../spatial/SceneNumberInput";
import { NumberInput } from "../../../shared/NumberInput";
import { EffectPositionContext } from "../sdk/EffectPositionPresentation";

export type EffectFieldTarget = MotionPropertyTarget | SceneMotionPropertyTarget;
interface FieldProps {
  engine?: EnginePort;
  target?: EffectFieldTarget;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}

/** The real owner selects the existing field adapter; subscriptions stay in its leaf. */
export function EffectMotionField({ target, ...props }: FieldProps) {
  const editor = useMotionFieldEditor();
  return target && "compositionId" in target ? (
    <SceneMotionField {...props} target={target} onStart={() => editor?.beginScene?.(target)} />
  ) : (
    <MotionField {...props} target={target} />
  );
}

export function EffectMotionValueField({
  target,
  ...props
}: {
  engine?: EnginePort;
  target?: EffectFieldTarget;
  fallback: MotionValue;
  children: (value: MotionValue) => ReactNode;
}) {
  return target && "compositionId" in target ? (
    <SceneMotionValue {...props} target={target} />
  ) : (
    <MotionValueField {...props} target={target} />
  );
}

export function EffectMotionNumberInput({
  target,
  ...props
}: Omit<ComponentProps<typeof MotionNumberInput>, "target"> & { target?: EffectFieldTarget }) {
  const position = useContext(EffectPositionContext);
  if (position && target && (target.property === "domainX" || target.property === "domainY"))
    return (
      <EffectMotionField
        engine={props.engine}
        target={target}
        label={props.label}
        disabled={props.disabled}
      >
        <NumberInput
          {...props}
          presentation={position.field(target.property, props.displayScale ?? 1)}
        />
      </EffectMotionField>
    );
  return target && "compositionId" in target ? (
    <EffectMotionField
      engine={props.engine}
      target={target}
      label={props.label}
      disabled={props.disabled}
    >
      <SceneNumberInput {...props} target={target} />
    </EffectMotionField>
  ) : (
    <MotionNumberInput {...props} target={target} />
  );
}
