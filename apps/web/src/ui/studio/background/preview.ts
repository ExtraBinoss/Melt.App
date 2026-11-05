import {
  backgroundLayer,
  backgroundPresetLayer,
  type Composition,
  type EnginePort,
} from "@musart/core";
import type { PreviewValue } from "../../../state/session/preview-source";

interface PreviewAdapter {
  read(): PreviewValue | null;
  write(value: PreviewValue | null): void;
}
interface PresentationAdapter {
  read(): Composition | null;
  subscribe(listener: () => void): () => void;
}
/** Owns exactly its own imperative draft; a competing tool's preview is never cleared. */
export function createBackgroundRecipePreview(
  engine: EnginePort,
  adapter: PreviewAdapter,
  presentation?: PresentationAdapter,
) {
  let owned: PreviewValue | null = null;
  let stop = () => {};
  let stopTime = () => {};
  const cancel = () => {
    if (owned && adapter.read() === owned) adapter.write(null);
    owned = null;
  };

  return {
    start() {
      stop = engine.subscribe(cancel);
      stopTime = presentation?.subscribe(cancel) ?? (() => {});
      return () => {
        cancel();
        stop();
        stopTime();
      };
    },
    preview(presetId: string) {
      cancel();
      const origin = engine.getSnapshot();
      const page =
        presentation?.read() ?? origin.project.pages.find((item) => item.id === origin.pageId)!;
      if (page.id !== origin.pageId || backgroundLayer(page)?.locked) return;
      let sequence = 0;
      const layer = backgroundPresetLayer(
        page,
        presetId,
        (prefix) => `preview-${page.id}-${prefix}-${sequence++}`,
      );
      const previous = backgroundLayer(page);
      owned = {
        target: "page",
        patch: {
          background: "#00000000",
          backgroundGradient: undefined,
          layers: previous
            ? page.layers.map((item) => (item.id === previous.id ? layer : item))
            : [layer, ...page.layers],
        },
      };
      adapter.write(owned);
    },
    cancel,
    dispose() {
      cancel();
      stop();
      stopTime();
    },
  };
}
