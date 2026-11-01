import { useCallback, memo, useEffect, useMemo, useRef, useState } from "react";
import { Image, Type, Shapes, Folder, Square, Circle, Clapperboard, Box } from "lucide-react";
import { isImageAsset, type Layer, type Asset } from "@musart/core";
import { scheduleLayerThumbnail } from "./thumbnail-idle";
import { observeLayerThumbnail } from "./thumbnail-visibility";
import type { EditorServices, LayerPreviewVariant } from "../../../state/contracts";
const icons = {
  image: Image,
  video: Clapperboard,
  text: Type,
  vector: Shapes,
  group: Folder,
  rectangle: Square,
  ellipse: Circle,
};
const revealed = new WeakSet<Blob>();
interface PreviewValue {
  key: string;
  owner: string;
  loaded?: boolean;
  url: string;
  blob: Blob;
  exporter: EditorServices["previewExport"];
}
/** One visible row owns one abortable request and explicitly releases its browser URL. */
export const LayerThumbnail = memo(function LayerThumbnail({
  layer,
  asset,
  services,
  previewKey,
  pageId,
  variant,
}: {
  layer: Layer;
  asset?: Asset;
  services?: Pick<EditorServices, "previewExport">;
  previewKey: string;
  pageId?: string;
  variant?: LayerPreviewVariant;
}) {
  const node = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState<PreviewValue | null>(null);
  const owned = useRef<PreviewValue | null>(null);
  const [previous, setPrevious] = useState<PreviewValue | null>(null);
  const retiring = useRef<PreviewValue | null>(null);
  const urls = useRef(new Set<string>());
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const release = useCallback((url: string) => {
    if (urls.current.delete(url)) URL.revokeObjectURL(url);
  }, []);
  function finishFade() {
    clearTimeout(fadeTimer.current);
    const before = retiring.current;
    retiring.current = null;
    if (before) release(before.url);
    setPrevious(null);
  }
  const kind = variant?.kind,
    effectId = variant?.kind === "effect" ? variant.effectId : undefined;
  const requestVariant = useMemo<LayerPreviewVariant | undefined>(
    () =>
      kind === "mask" ? { kind } : kind === "effect" ? { kind, effectId: effectId! } : undefined,
    [kind, effectId],
  );
  const key = JSON.stringify([previewKey, pageId, layer.id, requestVariant ?? null]);
  const observerKey = JSON.stringify([pageId, layer.id, requestVariant ?? null]);
  const [visibility, setVisibility] = useState<{ key: string; visible: boolean } | null>(null);
  const visible =
    typeof IntersectionObserver === "undefined" ||
    (visibility?.key === observerKey && visibility.visible);
  const previewExport = services?.previewExport;
  useEffect(() => {
    if (!node.current || typeof IntersectionObserver === "undefined") return;
    return observeLayerThumbnail(node.current, (active) =>
      setVisibility({ key: observerKey, visible: active }),
    );
  }, [observerKey]);
  // The virtual window already bounds ownership. Keep a decoded image while its
  // row crosses the observer margin, rather than revoking and decoding it again.
  useEffect(() => {
    const ownedUrls = urls.current;
    return () => {
      clearTimeout(fadeTimer.current);
      for (const url of ownedUrls) URL.revokeObjectURL(url);
      ownedUrls.clear();
      owned.current = null;
      retiring.current = null;
    };
  }, [observerKey, previewExport]);
  useEffect(() => {
    if (!visible || !previewExport) return;
    if (owned.current?.key === key && owned.current.exporter === previewExport) return;
    const controller = new AbortController();
    let active = true;
    const cancelIdle = scheduleLayerThumbnail(() => {
      if (!active || controller.signal.aborted) return;
      if (node.current)
        node.current.dataset.previewRequests = String(
          Number(node.current.dataset.previewRequests ?? 0) + 1,
        );
      return previewExport(
        {
          selection: [layer.id],
          ...(pageId ? { pageId } : {}),
          ...(requestVariant ? { variant: requestVariant } : {}),
          edge: 96,
          priority: "visible",
        },
        controller.signal,
      ).then(
        (result) => {
          if (!active || controller.signal.aborted) return;
          const before = owned.current?.loaded ? owned.current : retiring.current;
          clearTimeout(fadeTimer.current);
          for (const url of urls.current) if (url !== before?.url) release(url);
          retiring.current = before;
          setPrevious(before);
          const next = {
            key,
            owner: observerKey,
            url: URL.createObjectURL(result.blob),
            blob: result.blob,
            exporter: previewExport,
          };
          urls.current.add(next.url);
          owned.current = next;
          setValue(next);
        },
        () => {
          /* A failed/stale preview retains its truthful layer-kind placeholder. */
        },
      );
    });
    return () => {
      active = false;
      cancelIdle();
      controller.abort();
    };
  }, [visible, previewExport, layer.id, key, pageId, requestVariant, observerKey, release]);
  const Icon = layer.spatial?.enabled ? Box : icons[layer.kind];
  const source =
    value?.owner === observerKey && value.exporter === previewExport
      ? value.url
      : !services?.previewExport && !requestVariant
        ? asset && isImageAsset(asset)
          ? asset.dataUrl
          : undefined
        : undefined;
  return (
    <span
      ref={node}
      className="layer-thumbnail"
      data-thumbnail-layer-id={layer.id}
      data-thumbnail-variant={requestVariant?.kind ?? "layer"}
      data-thumbnail-effect-id={effectId}
      data-preview-ready={Boolean(source && (!previewExport || value?.key === key))}
    >
      <Icon size={14} aria-hidden="true" style={source ? { display: "none" } : undefined} />
      {previous?.owner === observerKey && previous.exporter === previewExport && (
        <img
          key={previous.url}
          src={previous.url}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-thumbnail-previous
        />
      )}
      {source && (
        <img
          key={source}
          src={source}
          alt=""
          draggable={false}
          onError={() => {
            if (owned.current?.url !== source) return;
            release(source);
            owned.current = retiring.current;
            retiring.current = null;
            setValue(owned.current);
            setPrevious(null);
          }}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (
              !image.isConnected ||
              node.current?.querySelector("img:not([data-thumbnail-previous])") !== image ||
              image.getAttribute("src") !== source
            )
              return;
            image.dataset.thumbnailLoaded = "true";
            if (owned.current?.url === source) owned.current.loaded = true;
            const before = retiring.current;
            const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (
              value?.owner === observerKey &&
              !reduced &&
              ((before && before.blob !== value.blob) || !revealed.has(value.blob))
            ) {
              revealed.add(value.blob);
              image.dataset.thumbnailReveal = "true";
            }
            if (before) {
              const old = node.current?.querySelector<HTMLImageElement>(
                "[data-thumbnail-previous]",
              );
              if (old && !reduced && before.blob !== value?.blob) {
                delete old.dataset.thumbnailReveal;
                old.dataset.thumbnailExit = "true";
              }
              fadeTimer.current = setTimeout(
                finishFade,
                reduced || before.blob === value?.blob ? 0 : 150,
              );
            }
          }}
        />
      )}
    </span>
  );
});
