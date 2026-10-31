import { useMemo } from "react";
import {
  compareMotionTime,
  resolveSceneMotionProperty,
  type EnginePort,
  type SceneMotionPropertyTarget,
} from "@musart/core";
import { createMotionTransport } from "../../services/motion/transport";
import { NumberInput, type NumberInputProps } from "../shared/NumberInput";
/** The native number field subscribes imperatively; playback never rerenders the inspector. */
export function SceneNumberInput({
  engine,
  target,
  ...props
}: NumberInputProps & {
  engine?: EnginePort;
  target?: SceneMotionPropertyTarget;
}) {
  const address = JSON.stringify(target);
  const presentation = useMemo(() => {
    if (!engine || !address) return undefined;
    const target = JSON.parse(address) as SceneMotionPropertyTarget;
    const transport = createMotionTransport(engine);
    const read = () => {
      const snapshot = engine.getSnapshot();
      const page =
        transport.readFrame() ??
        snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
      const value = resolveSceneMotionProperty(page, target)?.value;
      return typeof value === "number" ? value : props.value;
    };
    return {
      read,
      subscribe(listener: () => void) {
        let before = transport.read(),
          value = read();
        return transport.subscribe(() => {
          const next = transport.read(),
            nextValue = read();
          const changed =
            nextValue !== value ||
            before.mode !== next.mode ||
            before.compositionId !== next.compositionId ||
            compareMotionTime(before.time, next.time) !== 0;
          before = next;
          value = nextValue;
          if (changed) listener();
        });
      },
    };
  }, [engine, address, props.value]);
  return (
    <NumberInput
      {...props}
      presentation={presentation}
      value={presentation?.read() ?? props.value}
    />
  );
}
