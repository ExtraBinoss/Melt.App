import { memo, useLayoutEffect, useMemo, useRef, type ComponentProps } from "react";
import type { EnginePort, MotionPropertyTarget } from "@musart/core";
import { ColorControl } from "../ColorControl";
import { MotionField } from "./MotionField";
import { MotionValueField } from "./MotionValueField";
import { motionTargetKey } from "../../../state/session/motion-edit";
import { usePaintScope } from "./paint-scope";

type ColorProps = ComponentProps<typeof ColorControl>;
const ColorLeaf = memo(ColorControl);
export function MotionColorControl({
  engine,
  target,
  label,
  ...props
}: ColorProps & {
  engine?: EnginePort;
  target?: MotionPropertyTarget;
  label: string;
}) {
  const scope = usePaintScope(engine, props.invalidation);
  const committed = useRef(props);
  useLayoutEffect(() => {
    committed.current = props;
  });
  const callbacks = useMemo(
    () => ({
      onPreview: (value: string) => committed.current.onPreview(value),
      onCommit: (value: string) => committed.current.onCommit(value),
      onCancel: () => committed.current.onCancel(),
    }),
    [],
  );
  const identity = JSON.stringify([
    scope.identity,
    props.identity,
    target ? motionTargetKey(target) : null,
  ]);
  return (
    <MotionField
      engine={engine}
      target={target}
      label={label}
      disabled={props.disabled}
      className="motion-property-paint"
    >
      <MotionValueField engine={engine} target={target} fallback={props.value}>
        {(value) => (
          <ColorLeaf
            key={identity}
            {...props}
            {...callbacks}
            identity={identity}
            invalidation={scope.invalidation}
            value={String(value)}
          />
        )}
      </MotionValueField>
    </MotionField>
  );
}
