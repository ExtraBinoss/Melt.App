import { useEffect, useMemo, useRef } from "react";
import type { SpatialLibraryModels } from "../../../services/assets/spatial-library";
import type { SpatialLibraryEntry } from "./catalog";
import { createSpatialLibraryPreview } from "./preview-owner";

/** A single retained native surface follows the hovered tile; frames never enter React state. */
export function useTilePreview(store: SpatialLibraryModels, onError: (error: unknown) => void) {
  const current = useRef<{
    surface: HTMLDivElement;
    owner: ReturnType<typeof createSpatialLibraryPreview>;
  } | null>(null);
  const error = useRef(onError);
  useEffect(() => {
    error.current = onError;
  }, [onError]);
  const preview = useMemo(() => {
    const ensure = () => {
      if (!current.current) {
        const surface = document.createElement("div"),
          host = document.createElement("div");
        surface.className = "spatial-library-preview spatial-tile-preview";
        surface.setAttribute("aria-hidden", "true");
        host.className = "spatial-library-live";
        surface.append(host);
        current.current = {
          surface,
          owner: createSpatialLibraryPreview(host, store, (cause) => error.current(cause)),
        };
      }
      return current.current;
    };
    return {
      show(entry: SpatialLibraryEntry, target: HTMLElement) {
        const active = ensure();
        target.append(active.surface);
        void active.owner.setEntry(entry);
      },
      hide() {
        current.current?.owner.pause();
        current.current?.surface.remove();
      },
      async stop() {
        const active = current.current;
        current.current = null;
        active?.surface.remove();
        await active?.owner.stop();
      },
    };
  }, [store]);
  useEffect(
    () => () => {
      void preview.stop().catch(() => {});
    },
    [preview],
  );
  return preview;
}
