import { useCallback, useLayoutEffect, useRef } from "react";
import { useStore } from "jotai";
import type { Effect, EnginePort } from "@musart/core";
import { i18n } from "../../../../state/i18n";
import { previewAtom } from "../../../../state/session/editor";
import type { EffectPresetStore } from "../../../../services/effect-presets/store";
import { EffectPresetPreviewController } from "../../../../services/effect-presets/preview-controller";

export function useEffectPresetPreview(options: {
  engine?: EnginePort;
  effect: Effect;
  layerId?: string;
  getStore: () => EffectPresetStore;
  onCancel?: () => void;
  onError: (message: string) => void;
}) {
  const store = useStore(),
    latest = useRef(options),
    controller = useRef<EffectPresetPreviewController | null>(null);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const engine = options.engine;
  useLayoutEffect(() => {
    const owned = new EffectPresetPreviewController({
      engine,
      read: () => store.get(previewAtom),
      write: (preview) => store.set(previewAtom, preview),
      context: () => ({
        effectId: latest.current.effect.id,
        layerId: latest.current.layerId,
        get: (id) => latest.current.getStore().get(id),
        onCancel: latest.current.onCancel,
        onError: (message) =>
          latest.current.onError(
            message === "Preset unavailable"
              ? i18n.t("effectPresets:unavailable")
              : message === "stale"
                ? i18n.t("effectPresets:stale")
                : message,
          ),
      }),
    });
    controller.current = owned;
    owned.start();
    return () => {
      if (controller.current === owned) controller.current = null;
      owned.dispose();
    };
  }, [engine, store]);
  useLayoutEffect(() => () => controller.current?.cancel(), [options.effect.id, options.layerId]);
  const preview = useCallback((id: string) => controller.current?.preview(id), []);
  const cancel = useCallback(() => controller.current?.cancel(), []);
  return { preview, cancel };
}
