import type { EnginePort, MotionInputKind } from "@musart/core";
import type { EffectPadInput } from "./InputPad";

interface InputSession {
  owner?: { compositionId: string; layerId?: string };
  kind: MotionInputKind;
  emit(input: EffectPadInput): void;
  cancel(): void;
}
const sessions = new WeakMap<EnginePort, InputSession>();
const listeners = new WeakMap<EnginePort, Set<() => void>>();
/** Canvas adapters opt in only while a real recording is armed. Native edit gestures stay native. */
export function effectInputSession(engine: EnginePort) {
  return {
    read: () => sessions.get(engine) ?? null,
    subscribe(listener: () => void) {
      const set = listeners.get(engine) ?? new Set<() => void>();
      listeners.set(engine, set);
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
  };
}
export function beginEffectInputSession(engine: EnginePort, session: InputSession): () => void {
  sessions.get(engine)?.cancel();
  sessions.set(engine, session);
  listeners.get(engine)?.forEach((listener) => listener());
  return () => {
    if (sessions.get(engine) !== session) return;
    sessions.delete(engine);
    listeners.get(engine)?.forEach((listener) => listener());
  };
}
