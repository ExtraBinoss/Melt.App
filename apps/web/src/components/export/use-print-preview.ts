import { useEffect, useMemo, useRef, useState } from "react";
import type { Composition, Project, OutputFraming } from "@musart/core";
import type { ManagedImageOptions } from "@musart/render";
import type { EditorServices } from "../../state/contracts";

/** One acknowledged GPU/native-encoding request per revision; stale proofs are cancelled. */
export function usePrintPreview(
  project: Project,
  page: Composition,
  options: ManagedImageOptions,
  services: EditorServices,
  edge: number | null,
  framing?: OutputFraming,
) {
  const [resource, setResource] = useState<{
    key: object;
    url: string | null;
    failed: boolean;
    width: number;
    height: number;
  } | null>(null);
  const key = useMemo(() => ({ page, options, edge, framing }), [page, options, edge, framing]);
  const queue = useRef(Promise.resolve());
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    if (options.format !== "pdf" || edge === null) return;
    const controller = new AbortController();
    active.current = controller;
    let url: string | undefined;
    const work = queue.current
      .catch(() => {})
      .then(async () => {
        const { createRenderSession, printComposition, encodeManagedImage } =
          await import("@musart/render");
        controller.signal.throwIfAborted();
        const renderer = createRenderSession({
          maxBytes: 128 * 1024 * 1024,
          fontResolver: services.fonts?.resolve,
          mediaResolver: services.mediaResolverFor?.(project.id),
        });
        try {
          if (framing && options.print.bleedMm !== 0)
            throw new Error("Print bleed is unavailable with output framing.");
          const printable = framing ? page : printComposition(page, options.print);
          const width = framing?.width ?? page.width,
            height = framing?.height ?? page.height;
          const scale = Math.min(
            1,
            edge / Math.max(framing?.width ?? printable.width, framing?.height ?? printable.height),
          );
          const blob = await renderer.withCanvasFrame(
            printable,
            project.assets,
            (canvas) =>
              new Promise<Blob>((resolve, reject) =>
                canvas.toBlob(
                  (blob) => (blob ? resolve(blob) : reject(new Error("Preview encoding failed"))),
                  "image/png",
                ),
              ),
            {
              scale,
              framing,
              signal: controller.signal,
              colorOutput: options.colorMode === "cmyk" ? "source" : "display",
            },
          );
          const proof = await encodeManagedImage(
            { blob, options, width, height, name: page.name, proof: true },
            controller.signal,
          );
          controller.signal.throwIfAborted();
          url = URL.createObjectURL(proof);
          setResource({
            key,
            url,
            failed: false,
            width: Math.round((framing?.width ?? printable.width) * scale),
            height: Math.round((framing?.height ?? printable.height) * scale),
          });
        } finally {
          await renderer.dispose();
        }
      });
    queue.current = work.catch(() => {
      if (!controller.signal.aborted)
        setResource({ key, url: null, failed: true, width: 0, height: 0 });
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, project, page, options, services, edge, framing]);
  return {
    release: () => {
      active.current?.abort();
      return queue.current;
    },
    url: resource?.key === key ? resource.url : null,
    loading: resource?.key !== key,
    failed: resource?.key === key && resource.failed,
    width: resource?.width ?? 0,
    height: resource?.height ?? 0,
  };
}
