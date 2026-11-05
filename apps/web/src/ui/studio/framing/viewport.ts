import type { Bounds, EnginePort } from "@musart/core";
export interface StudioViewport {
  projectId: string;
  pageId: string;
  region: Bounds;
  /** Entire presented GPU window, including paint beyond the canonical capture gate. */
  displayRegion: Bounds;
  width: number;
  height: number;
}
const ports = new WeakMap<EnginePort, ReturnType<typeof createPort>>();
function createPort() {
  let value: StudioViewport | null = null;
  const listeners = new Set<() => void>();
  return {
    read: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(next: StudioViewport | null) {
      if (JSON.stringify(next) === JSON.stringify(value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
  };
}
export function getStudioViewport(engine: EnginePort) {
  let port = ports.get(engine);
  if (!port) {
    port = createPort();
    ports.set(engine, port);
  }
  return port;
}
