import { useEffect, useMemo, useRef, useState } from "react";
import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import type { TaskRunner } from "../../../components/projects/ProjectDialog";
import { SpatialLibraryPreview } from "../../../components/spatial/library/SpatialLibraryPreview";
import type { SpatialLibraryPreviewHandle } from "../../../components/spatial/library/SpatialLibraryPreview";
import type { SpatialLibraryEntry } from "../../../components/spatial/library/catalog";
import { StudioPackCache } from "../../../services/assets/studio/cache";
import { STUDIO_PACK } from "../../../services/assets/studio/integrity";
import type { StudioManifest, StudioModel } from "../../../services/assets/studio/integrity";
import { SpatialLibraryModels } from "../../../services/assets/spatial-library";
import { importSpatialModel } from "../../../services/assets/spatial-import";
import "./messages";
const PAGE_SIZE = 24;
export function StudioPackLibrary({ engine, onTask }: { engine: EnginePort; onTask: TaskRunner }) {
  const { t } = useTranslation("studioLibrary");
  const cache = useMemo(() => new StudioPackCache(), []);
  const store = useMemo(() => new SpatialLibraryModels(cache.fetchModel), [cache]);
  const [manifest, setManifest] = useState<StudioManifest | null>(null),
    [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<StudioModel | null>(null);
  const [previewGeneration, setPreviewGeneration] = useState(0);
  const pending = useRef<AbortController | null>(null),
    preview = useRef<SpatialLibraryPreviewHandle>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void cache
      .installed(controller.signal)
      .then((installed) => {
        if (!controller.signal.aborted) {
          setManifest(installed);
          setSelected(installed?.models[0] ?? null);
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
        setSelected(installed.models[0] ?? null);
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
      await preview.current?.stop();
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
        await importSpatialModel(
          engine,
          new File([blob], `${model.id}.glb`, { type: "model/gltf-binary" }),
          controller.signal,
          { name: model.name, useModelMaterials: true },
        );
      }, t("imported"));
    } catch {
      if (alive.current && !controller.signal.aborted) setError(t("failed"));
    } finally {
      if (pending.current === controller) pending.current = null;
      if (alive.current) {
        setBusy(false);
        setPreviewGeneration((value) => value + 1);
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
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE),
    currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const entry: SpatialLibraryEntry | null = selected
    ? {
        id: selected.id,
        kind: "model",
        model: selected,
        nameKey: selected.nameKey,
        index: 0,
        originalMaterials: true,
      }
    : null;
  return (
    <section
      className="studio-pack-library"
      aria-label={t("packTitle")}
      aria-busy={busy || checking}
    >
      <strong>{t("packTitle")}</strong>
      <p className="studio-library-hint">{t("packDescription", { count: STUDIO_PACK.count })}</p>
      <a
        className="studio-pack-license"
        href="https://kenney.nl/assets"
        target="_blank"
        rel="noreferrer"
      >
        {t("license")}
      </a>
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
          <span className="studio-library-hint">{t("installed")}</span>
          {entry && (
            <SpatialLibraryPreview
              key={previewGeneration}
              ref={preview}
              entry={entry}
              store={store}
              onError={() => setError(t("failed"))}
            />
          )}
          {selected && (
            <div className="studio-pack-selected">
              <span>{selected.name}</span>
              <Button size="sm" disabled={busy} onClick={() => void add(selected)}>
                {t("add")}
              </Button>
            </div>
          )}
          <Input
            value={query}
            disabled={busy}
            aria-label={t("search")}
            placeholder={t("search")}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
          <div className="studio-pack-grid">
            {filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((model) => (
              <button
                type="button"
                key={model.id}
                disabled={busy}
                aria-pressed={model.id === selected?.id}
                onClick={() => {
                  setSelected(model);
                  setError("");
                }}
              >
                {model.name}
              </button>
            ))}
          </div>
          {!filtered.length && <p>{t("empty")}</p>}
          {pageCount > 1 && (
            <div className="studio-pack-pages">
              <Button
                variant="outline"
                size="sm"
                aria-label={t("previous")}
                disabled={busy || currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                ←
              </Button>
              <span>
                {currentPage + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label={t("next")}
                disabled={busy || currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                →
              </Button>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="spatial-import-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
