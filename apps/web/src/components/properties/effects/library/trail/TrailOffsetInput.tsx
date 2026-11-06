import { useMemo } from "react";
import {
  getEffectParameter,
  resolveTrailMode,
  type Effect,
  type EffectParameter,
  type EnginePort,
} from "@musart/core";
import { NumberInput, type NumberInputProps } from "../../../../shared/NumberInput";
import { createMotionTransport } from "../../../../../services/motion/transport";
import { EffectMotionField, type EffectFieldTarget } from "../../effect-motion/fields";

/** Sparse Auto offsets have a source-dependent default. Read it imperatively, just like Motion
 * fields, without baking that derived value into the document or rerendering the inspector.
 */
export function TrailOffsetInput({
  engine,
  target,
  effect,
  parameter,
  layerId,
  displayScale = 1,
  ...props
}: NumberInputProps & {
  engine?: EnginePort;
  target?: EffectFieldTarget;
  effect: Effect;
  parameter: EffectParameter;
  layerId?: string;
  displayScale?: number;
}) {
  const presentation = useMemo(() => {
    if (!engine) return undefined;
    const transport = createMotionTransport(engine);
    return {
      subscribe: transport.subscribe,
      read: () => {
        const snapshot = engine.getSnapshot();
        const page =
          transport.readFrame() ??
          snapshot.project.pages.find((page) => page.id === snapshot.pageId);
        if (!page) return props.value;
        const current =
          (layerId
            ? page.layers.find((layer) => layer.id === layerId)?.effects
            : page.effects
          )?.find((item) => item.id === effect.id) ?? effect;
        return (
          Number(getEffectParameter(resolveTrailMode(current, page, layerId), parameter)) *
          displayScale
        );
      },
    };
  }, [engine, effect, parameter, layerId, displayScale, props.value]);
  return (
    <EffectMotionField
      engine={engine}
      target={target}
      label={props.label}
      disabled={props.disabled}
    >
      <NumberInput {...props} presentation={presentation} />
    </EffectMotionField>
  );
}
