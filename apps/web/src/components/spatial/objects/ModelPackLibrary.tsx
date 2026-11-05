import { useEffect, useMemo, useRef, useState } from "react";
import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { Box, Plus, Info } from "lucide-react";
import type { SpatialLibraryPanelContext } from "../SpatialLibrary";
import { useTilePreview } from "../library/use-tile-preview";
import { publishEditorNotice } from "../../notifications/source";
import "../../notifications/messages";
import type { TaskRunner } from "../../projects/ProjectDialog";
import type { SpatialLibraryEntry } from "../library/catalog";
import { StudioPackCache } from "../../../services/assets/studio/cache";
import { STUDIO_PACK } from "../../../services/assets/studio/integrity";
import type { StudioManifest, StudioModel } from "../../../services/assets/studio/integrity";
import { SpatialLibraryModels } from "../../../services/assets/spatial-library";
import { importSpatialModel } from "../../../services/assets/spatial-import";
import "./messages";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { useVirtualList } from "../../shared/scroll/use-virtual-list";
import { IconButton } from "../../shared/IconButton";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { usePackAtlas } from "./use-pack-atlas";
import { packPosterStyle } from "../../../services/assets/studio/posters";
const ROW_HEIGHT = 102;
export function ModelPackLibrary({
  engine,
  onTask,
  query = "",
  close,
}: { engine: EnginePort; onTask: TaskRunner } & Partial<SpatialLibraryPanelContext>) {
  const { t } = useTranslation("studioLibrary");
  const { t: common } = useTranslation();
  const cache = useMemo(() => new StudioPackCache(), []);
  const store = useMemo(() => new SpatialLibraryModels(cache.fetchModel), [cache]);
  const [manifest, setManifest] = useState<StudioManifest | null>(null),
    [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);
  const preview = useTilePreview(store, () => setError(t("failed")));
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void cache
      .installed(controller.signal)
      .then((installed) => {
        if (!controller.signal.aborted) {
          setManifest(installed);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t("storage"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    const origin = engine.getSnapshot();
    const unsubscribe = engine.subscribe(() => {
      const current = engine.getSnapshot();
      if (current.project.id !== origin.project.id || current.pageId !== origin.pageId)
        pending.current?.abort();
    });
    return () => {
      alive.current = false;
      controller.abort();
      pending.current?.abort();
      unsubscribe();
      store.clear();
    };
  }, [cache, engine, store, t]);
  async function download() {
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      const installed = await cache.install(controller.signal, (value) => {
        if (alive.current && !controller.signal.aborted) setProgress(value);
      });
      if (alive.current && !controller.signal.aborted) {
        setManifest(installed);
      }
    } catch (cause) {
      if (alive.current && !controller.signal.aborted) {
        setError(t("failed"));
        void onTask(() => {
          throw cause;
        });
      }
    } finally {
      if (pending.current === controller) pending.current = null;
      if (alive.current) setBusy(false);
    }
  }
  async function add(model: StudioModel) {
    const controller = new AbortController(),
      origin = engine.getSnapshot();
    pending.current?.abort();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      await preview.stop();
      controller.signal.throwIfAborted();
      const asset = await store.load(model, controller.signal);
      const blob = await (await fetch(asset.dataUrl, { signal: controller.signal })).blob();
      controller.signal.throwIfAborted();
      const current = engine.getSnapshot();
      if (
        current.project !== origin.project ||
        current.pageId !== origin.pageId ||
        current.revision !== origin.revision
      )
        return;
      await onTask(async () => {
        controller.signal.throwIfAborted();
        const scope = engine.getSnapshot();
        if (
          scope.project !== origin.project ||
          scope.pageId !== origin.pageId ||
          scope.revision !== origin.revision
        )
          throw new DOMException("Composition changed", "AbortError");
        const layer = await importSpatialModel(
          engine,
          new File([blob], `${model.id}.glb`, { type: "model/gltf-binary" }),
          controller.signal,
          { name: model.name, useModelMaterials: true },
        );
        publishEditorNotice(engine, {
          message: common("objectAdded", { ns: "notices", name: layer.name }),
          error: false,
        });
        close?.();
      });
    } catch {
      if (alive.current && !controller.signal.aborted) setError(t("failed"));
    } finally {
      if (pending.current === controller) pending.current = null;
      if (alive.current) {
        setBusy(false);
      }
    }
  }
  const filtered = useMemo(
    () =>
      manifest?.models.filter((model) =>
        `${model.name} ${model.family}`.toLowerCase().includes(query.trim().toLowerCase()),
      ) ?? [],
    [manifest, query],
  );
  const rows = useVirtualList(Math.ceil(filtered.length / 4), ROW_HEIGHT, viewport, 2);
  const visible = useMemo(
    () => filtered.slice(rows.first * 4, rows.last * 4),
    [filtered, rows.first, rows.last],
  );
  const atlas = usePackAtlas(!!manifest);
  const indices = useMemo(
    () => new Map(manifest?.models.map((model, index) => [model.id, index])),
    [manifest],
  );
  useEffect(() => {
    preview.hide();
    viewport.current?.scrollTo({ top: 0 });
  }, [query, preview]);
  function entry(model: StudioModel): SpatialLibraryEntry {
    return {
      id: model.id,
      kind: "model",
      model,
      nameKey: model.nameKey,
      index: 0,
      originalMaterials: true,
    };
  }
  return (
    <section
      className="studio-pack-library"
      aria-label={t("packTitle")}
      aria-busy={busy || checking}
    >
      <div className="studio-pack-info">
        <Popover modal={false}>
          <PopoverTrigger asChild>
            <IconButton label={t("learnMore")} tooltipSide="top">
              <Info size={16} />
            </IconButton>
          </PopoverTrigger>
          <PopoverContent side="left" className="studio-pack-credits">
            <strong>{t("packTitle")}</strong>
            <p className="studio-library-hint">
              {t("packDescription", { count: STUDIO_PACK.count })}
            </p>
            <a
              className="studio-pack-license"
              href="https://kenney.nl/assets"
              target="_blank"
              rel="noreferrer"
            >
              {t("license")}
            </a>
          </PopoverContent>
        </Popover>
      </div>
      {!manifest && (
        <Button disabled={busy || checking || !cache.supported} onClick={() => void download()}>
          {busy
            ? t("downloading", { progress: Math.round(progress * 100) })
            : t("download", { size: (STUDIO_PACK.byteLength / 1e6).toFixed(1) })}
        </Button>
      )}
      {!cache.supported && <p role="alert">{t("storage")}</p>}
      {busy && (
        <Button variant="outline" onClick={() => pending.current?.abort()}>
          {t("cancel")}
        </Button>
      )}
      {manifest && (
        <>
          <ScrollShadow fade="mask" className="studio-library-scroll-shadow">
            <div
              className="studio-library-scroll"
              ref={rows.attachViewport}
              onScroll={rows.onScroll}
              onPointerLeave={() => preview.hide()}
            >
              <div className="studio-pack-space" style={{ height: rows.height }}>
                <div className="studio-pack-grid" style={{ top: rows.first * ROW_HEIGHT }}>
                  {visible.map((model) => (
                    <button
                      type="button"
                      key={model.id}
                      disabled={busy}
                      className="spatial-object"
                      data-pack-model={model.id}
                      title={model.name}
                      onPointerEnter={(event) => {
                        if (event.pointerType !== "touch")
                          preview.show(
                            entry(model),
                            event.currentTarget.querySelector<HTMLElement>(
                              ".spatial-object-visual",
                            )!,
                          );
                      }}
                      onFocus={(event) =>
                        preview.show(
                          entry(model),
                          event.currentTarget.querySelector<HTMLElement>(".spatial-object-visual")!,
                        )
                      }
                      onBlur={() => preview.hide()}
                      onClick={() => void add(model)}
                    >
                      <span className="spatial-object-visual" aria-hidden>
                        <Box size={35} strokeWidth={1} />
                        <span
                          className="studio-pack-poster"
                          data-pack-poster={model.id}
                          hidden={!atlas.image}
                          style={packPosterStyle(indices.get(model.id)!, atlas.image)}
                        />
                      </span>
                      <Plus size={15} className="spatial-object-add" aria-hidden />
                      <span className="spatial-object-name">{model.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              {!filtered.length && <p>{t("empty")}</p>}
            </div>
          </ScrollShadow>
        </>
      )}
      {(error || atlas.failed) && (
        <p className="spatial-import-error" role="alert">
          {error || t("failed")}
        </p>
      )}
    </section>
  );
}
