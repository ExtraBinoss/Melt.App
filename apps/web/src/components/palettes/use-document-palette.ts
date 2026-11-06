import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Composition, EnginePort, PaletteSwatch, Project } from "@musart/core";
import { detectedSwatches } from "../../services/palettes/detection/colors";
import { extractDocumentPalette } from "../../services/palettes/detection/extract";
import { PaletteImageSampler } from "../../services/palettes/detection/image-client";

type PaletteResult = { colors: PaletteSwatch[]; busy: boolean; error?: string };

/** Mount only in the open picker. Work starts after its opening input task; engine
 * notifications are imperative and selection changes never start source decoding.
 */
export function useDocumentPalette(
  engine: EnginePort | undefined,
  fallback: string,
): PaletteResult {
  const [result, setResult] = useState<PaletteResult>(() => ({
    colors: detectedSwatches([{ value: fallback, weight: 1 }]),
    busy: Boolean(engine),
  }));
  const fallbackRef = useRef(fallback);
  useLayoutEffect(() => {
    fallbackRef.current = fallback;
  }, [fallback]);
  useEffect(() => {
    const sampler = new PaletteImageSampler();
    let disposed = false,
      generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let previousPage: Composition | undefined, previousAssets: Project["assets"] | undefined;
    let previousProjectId: string | undefined;
    const refresh = () => {
      const snapshot = engine?.getSnapshot();
      const page = snapshot?.project.pages.find((item) => item.id === snapshot.pageId);
      const project = snapshot?.project;
      if (
        page === previousPage &&
        project?.assets === previousAssets &&
        project?.id === previousProjectId
      )
        return;
      const changedScope = previousPage?.id !== page?.id || previousProjectId !== project?.id;
      previousPage = page;
      previousAssets = project?.assets;
      previousProjectId = project?.id;
      const token = ++generation;
      clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      timer = setTimeout(
        () => {
          if (disposed || token !== generation) return;
          const sources =
            project && page ? extractDocumentPalette(project, page) : { colors: [], images: [] };
          const base = sources.colors;
          const authored = detectedSwatches(base);
          setResult({ colors: authored, busy: Boolean(sources.images.length) });
          void (async () => {
            const colors = [...base];
            let error: string | undefined;
            for (const { asset, weight } of sources.images) {
              try {
                const histogram = await sampler.sample(asset, signal);
                if (disposed || token !== generation) return;
                colors.push(
                  ...histogram.map((color) => ({
                    value: color.value,
                    weight: color.weight * weight,
                  })),
                );
              } catch (cause) {
                if (signal.aborted || disposed || token !== generation) return;
                error ??= cause instanceof Error ? cause.message : String(cause);
              }
            }
            if (disposed || token !== generation) return;
            const detected = detectedSwatches(colors);
            setResult({
              colors: detected.length
                ? detected
                : detectedSwatches([{ value: fallbackRef.current, weight: 1 }]),
              busy: false,
              ...(error ? { error } : {}),
            });
          })();
        },
        changedScope ? 0 : 120,
      );
    };
    // An absent engine still resolves to its literal local fallback.
    if (engine) refresh();
    const unsubscribe = engine?.subscribe(refresh);
    return () => {
      disposed = true;
      generation++;
      clearTimeout(timer);
      unsubscribe?.();
      controller?.abort();
      sampler.dispose();
    };
  }, [engine]);
  return engine
    ? result
    : { colors: detectedSwatches([{ value: fallback, weight: 1 }]), busy: false };
}
