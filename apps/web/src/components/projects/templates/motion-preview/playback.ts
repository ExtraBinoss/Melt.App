import { createSliderValue } from "../../../ui/slider-value";

/** Frame positions are imperative; React only subscribes to control-state changes. */
export function createPreviewPlayback() {
  const position = createSliderValue();
  let state = { duration: 0, playing: false, ready: false };
  const listeners = new Set<() => void>();
  return {
    position,
    read: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: (next: Partial<typeof state>) => {
      if (Object.entries(next).every(([key, value]) => state[key as keyof typeof state] === value))
        return;
      state = { ...state, ...next };
      for (const listener of listeners) listener();
    },
  };
}
export type PreviewPlayback = ReturnType<typeof createPreviewPlayback>;
