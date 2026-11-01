import {
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type EnginePort, type MotionPropertyTarget } from "@musart/core";
import { NumberInput, type NumberInputProps } from "../../shared/NumberInput";
import { MotionField } from "./MotionField";
import { createNumberFallback, createNumberPresentation } from "./number-presentation";
import { MobileMotionNumberLeaf, MotionNumberLeaf } from "./number-leaf";
import { MobileControlsContext } from "../../workspace/mobile/use-mobile";

interface Props extends NumberInputProps {
  engine?: EnginePort;
  target?: MotionPropertyTarget;
  displayScale?: number;
  targets?: readonly MotionPropertyTarget[];
  keyframeTargets?: readonly MotionPropertyTarget[];
}
export function MotionNumberInput(props: Props) {
  return props.engine && props.target ? (
    <LiveNumber {...props} engine={props.engine} target={props.target} />
  ) : (
    <NumberInput {...props} />
  );
}
function LiveNumber({
  engine,
  target,
  targets,
  keyframeTargets,
  displayScale = 1,
  ...props
}: Props & { engine: EnginePort; target: MotionPropertyTarget }) {
  const key = JSON.stringify(targets ?? [target]);
  const mobile = useContext(MobileControlsContext);
  const rangeSensitive =
    mobile && ((props.min ?? -100000) <= -100000 || (props.max ?? 100000) >= 100000);
  const committed = useRef(props);
  const [fallback] = useState(() => createNumberFallback(props.value));
  const identity = useRef(props.identity);
  const presentation = useMemo(
    () =>
      createNumberPresentation(
        engine,
        JSON.parse(key) as MotionPropertyTarget[],
        displayScale,
        fallback.read,
        rangeSensitive,
      ),
    [engine, key, displayScale, rangeSensitive, fallback],
  );
  const owner = useSyncExternalStore(
    presentation.subscribeOwner,
    presentation.readOwner,
    presentation.readOwner,
  );
  const callbacks = useMemo(
    () => ({
      onCommit: (value: number) => committed.current.onCommit(value),
      onPreview: (value: number) => committed.current.onPreview?.(value),
      onCancel: () => committed.current.onCancel?.(),
      onStart: () => committed.current.onStart?.(),
      resetValue: () => {
        const reset = committed.current.resetValue ?? 0;
        return typeof reset === "function" ? reset() : reset;
      },
    }),
    [],
  );
  useLayoutEffect(() => {
    const changed = !Object.is(identity.current, props.identity) || fallback.read() !== props.value;
    fallback.commit(props.value);
    if (changed) presentation.invalidate();
    identity.current = props.identity;
    committed.current = props;
  });
  const live = presentation.read();
  const Field = mobile ? MobileMotionNumberLeaf : MotionNumberLeaf;
  return (
    <MotionField
      engine={engine}
      target={target}
      targets={keyframeTargets ?? targets}
      label={props.label}
      disabled={props.disabled}
    >
      <Field
        {...props}
        {...callbacks}
        identity={`${owner}:${key}`}
        presentation={presentation}
        value={live ?? props.value}
        mixed={live === null}
      />
    </MotionField>
  );
}
