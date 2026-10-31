import { ToolController } from "./controller";
import type { WorkspaceProps } from "./types";
/** The effect owns the live controller; StrictMode replay installs a fresh, open owner. */
export function createControllerSlot() {
  let current: ToolController | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    read: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect(host: HTMLDivElement, activity: WorkspaceProps["onActivity"]) {
      const controller = new ToolController(host, activity);
      current = controller;
      notify();
      return () => {
        if (current === controller) {
          current = null;
          notify();
        }
        void controller
          .dispose()
          .catch((error: unknown) => console.error("Melt tool cleanup failed", error));
      };
    },
  };
}
