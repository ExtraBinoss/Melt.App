import type { EnginePort } from "@musart/core";
import i18n from "i18next";
import { publishEditorNotice } from "../../components/notifications/source";
import "../../components/notifications/messages";

export type ViewportAction = "fit" | "reset" | "recenter" | "zoomIn" | "zoomOut";
export interface ViewportFocus {
  x: number;
  y: number;
  factor: number;
}
export interface ViewportActions {
  focus: (target: ViewportFocus) => boolean;
  subscribeFocus: (listener: (target: ViewportFocus) => void) => () => void;
  run: (action: ViewportAction) => boolean;
  subscribe: (listener: (action: ViewportAction) => void) => () => void;
}
const ports = new WeakMap<EnginePort, ViewportActions>();

/** Presentation commands shared by canvas controls and command search. */
export function createViewportActions(engine: EnginePort): ViewportActions {
  const existing = ports.get(engine);
  if (existing) return existing;
  const listeners = new Set<(action: ViewportAction) => void>();
  const focusListeners = new Set<(target: ViewportFocus) => void>();
  const port: ViewportActions = {
    focus: (target) => {
      if (![target.x, target.y, target.factor].every(Number.isFinite) || target.factor <= 0)
        return false;
      const active = [...focusListeners];
      active.forEach((listener) => listener(target));
      return active.length > 0;
    },
    subscribeFocus: (listener) => {
      focusListeners.add(listener);
      return () => {
        focusListeners.delete(listener);
      };
    },
    run: (action) => {
      const active = [...listeners];
      for (const listener of active) listener(action);
      if (active.length && (action === "recenter" || action === "reset"))
        publishEditorNotice(engine, {
          title: i18n.t("notices:confirmed"),
          message: i18n.t("notices:viewRecentered"),
          error: false,
        });
      return active.length > 0;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  ports.set(engine, port);
  return port;
}
