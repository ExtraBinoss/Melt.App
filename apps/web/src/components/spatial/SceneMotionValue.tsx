import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  resolveSceneMotionProperty,
  type EnginePort,
  type MotionValue,
  type SceneMotionPropertyTarget,
} from "@musart/core";
import { createMotionTransport } from "../../services/motion/transport";
/** Discrete controls subscribe at the leaf, preserving the shared scene authoring surface. */
export function SceneMotionValue({
  engine,
  target,
  fallback,
  children,
}: {
  engine?: EnginePort;
  target?: SceneMotionPropertyTarget;
  fallback: MotionValue;
  children: (value: MotionValue) => ReactNode;
}) {
  const address = JSON.stringify(target);
  const source = useMemo(() => {
    if (!engine || !address) return { subscribe: () => () => {}, read: () => fallback };
    const target = JSON.parse(address) as SceneMotionPropertyTarget;
    const transport = createMotionTransport(engine);
    return {
      subscribe: transport.subscribe,
      read: () => {
        const snapshot = engine.getSnapshot();
        const page =
          transport.readFrame() ??
          snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
        return resolveSceneMotionProperty(page, target)?.value ?? fallback;
      },
    };
  }, [engine, address, fallback]);
  const value = useSyncExternalStore(source.subscribe, source.read, source.read);
  return children(value);
}
