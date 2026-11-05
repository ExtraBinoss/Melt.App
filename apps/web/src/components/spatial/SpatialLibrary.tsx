import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Box, Plus, Upload } from "lucide-react";
import type { EnginePort } from "@musart/core";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { IconButton } from "../shared/IconButton";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { SegmentedTabs } from "../shared/segmented/SegmentedTabs";
import { SearchInput } from "../assets/SearchInput";
import { importSpatialModel, insertSpatialObject } from "../../services/assets/spatial-import";
import { SpatialLibraryModels } from "../../services/assets/spatial-library";
import { beginLibraryDrag, type LibraryDropTarget } from "../../services/assets/library-drag";
import { publishEditorNotice } from "../notifications/source";
import {
  SPATIAL_LIBRARY_MODELS,
  SPATIAL_LIBRARY_SHAPES,
  spatialLibrarySwatch,
  type SpatialLibraryEntry,
} from "./library/catalog";
import { useTilePreview } from "./library/use-tile-preview";
import "../notifications/messages";
import "../assets/messages";
import "./messages";
import "./spatial.css";
import "./library/library.css";

export interface SpatialLibraryPanelContext {
  query: string;
  close: () => void;
}
type LibraryPanel = {
  label: string;
  content: ReactNode | ((context: SpatialLibraryPanelContext) => ReactNode);
};
export function SpatialLibrary({
  engine,
  tooltipSide,
  vectorLibrary,
  modelPacks,
}: {
  engine: EnginePort;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  vectorLibrary?: LibraryPanel;
  modelPacks?: LibraryPanel;
}) {
  const { t } = useTranslation("spatial");
  const { t: common } = useTranslation();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [tab, setTab] = useState("shapes"),
    [query, setQuery] = useState("");
  const store = useMemo(() => new SpatialLibraryModels(), []);
  const input = useRef<HTMLInputElement>(null),
    pending = useRef<AbortController | null>(null);
  const preview = useTilePreview(store, () => setError(t("errors.render")));
  useEffect(
    () => () => {
      pending.current?.abort();
      store.clear();
    },
    [store],
  );
  const entries = tab === "models" ? SPATIAL_LIBRARY_MODELS : SPATIAL_LIBRARY_SHAPES;
  const filtered = entries.filter((entry) =>
    `${t(entry.nameKey)} ${entry.id}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const native = tab === "shapes" || tab === "models";
  async function add(entry: SpatialLibraryEntry | File, target?: LibraryDropTarget) {
    if (busy) return;
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    const origin = engine.getSnapshot();
    const signal = target ? AbortSignal.any([controller.signal, target.signal]) : controller.signal;
    setBusy(true);
    setError("");
    try {
      await preview.stop();
      signal.throwIfAborted();
      target?.assertCurrent();
      const current = engine.getSnapshot();
      if (
        current.project !== origin.project ||
        current.pageId !== origin.pageId ||
        current.revision !== origin.revision
      )
        return;
      let layer;
      if (entry instanceof File) layer = await importSpatialModel(engine, entry, signal);
      else if (entry.kind === "shape")
        layer = insertSpatialObject(engine, entry.source, t(entry.nameKey), {
          fill: "#b8bcc4",
          point: target?.point,
        });
      else {
        const asset = await store.load(entry.model, signal);
        const blob = await (await fetch(asset.dataUrl, { signal })).blob();
        signal.throwIfAborted();
        target?.assertCurrent();
        const current = engine.getSnapshot();
        if (
          current.project !== origin.project ||
          current.pageId !== origin.pageId ||
          current.revision !== origin.revision
        )
          return;
        layer = await importSpatialModel(
          engine,
          new File([blob], `${entry.id}.glb`, { type: "model/gltf-binary" }),
          signal,
          { name: t(entry.nameKey), useModelMaterials: true, point: target?.point },
        );
      }
      publishEditorNotice(engine, {
        message: common("objectAdded", { ns: "notices", name: layer.name }),
        error: false,
      });
      setOpen(false);
    } catch (cause) {
      if (!signal.aborted && !(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(t("errors.import"));
        setOpen(true);
      }
    } finally {
      if (pending.current === controller) pending.current = null;
      setBusy(false);
    }
  }
  const close = () => {
    void preview.stop();
    setOpen(false);
  };
  function panel(value: LibraryPanel | undefined) {
    return typeof value?.content === "function" ? value.content({ query, close }) : value?.content;
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          pending.current?.abort();
          void preview.stop();
        }
        setOpen(next);
      }}
      modal={false}
    >
      <PopoverTrigger asChild>
        <IconButton label={t("title")} tooltipSide={tooltipSide} disabled={busy}>
          <Box strokeWidth={1.65} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        side={tooltipSide === "bottom" ? "bottom" : "right"}
        align="start"
        className="spatial-library"
        aria-label={t("objects")}
        data-canvas-control
      >
        <div className="spatial-library-search">
          <SearchInput
            aria-label={common("common.search")}
            autoFocus
            captureTyping
            value={query}
            hints={entries.slice(0, 6).map((entry) => ({ label: t(entry.nameKey) }))}
            disabled={busy}
            onChange={(event) => {
              preview.hide();
              setQuery(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (
                native &&
                event.key === "Enter" &&
                filtered[0] &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void add(filtered[0]);
              }
            }}
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
            title={t("importModel")}
          >
            <Upload size={14} aria-hidden />
            <span>GLB</span>
          </Button>
        </div>
        <SegmentedTabs
          mode="choice"
          size="compact"
          label={t("library")}
          value={tab}
          disabled={busy}
          items={[
            { value: "shapes", label: t("shapes") },
            { value: "models", label: t("models") },
            ...(vectorLibrary ? [{ value: "vectors", label: vectorLibrary.label }] : []),
            ...(modelPacks ? [{ value: "packs", label: modelPacks.label }] : []),
          ]}
          onValueChange={(value) => {
            if (value === "shapes" || value === "models") preview.hide();
            else void preview.stop();
            setTab(value);
            setError("");
          }}
        />
        {native && (
          <ScrollShadow fade="mask">
            <div className="spatial-library-list" onPointerLeave={() => preview.hide()}>
              <div className="spatial-objects">
                {filtered.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    disabled={busy}
                    className="spatial-object"
                    aria-label={t(entry.nameKey)}
                    title={t(entry.nameKey)}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== "touch")
                        preview.show(
                          entry,
                          event.currentTarget.querySelector<HTMLElement>(".spatial-object-visual")!,
                        );
                    }}
                    onFocus={(event) =>
                      preview.show(
                        entry,
                        event.currentTarget.querySelector<HTMLElement>(".spatial-object-visual")!,
                      )
                    }
                    onBlur={() => preview.hide()}
                    draggable={!busy}
                    onDragStart={(event) => {
                      void preview.stop();
                      beginLibraryDrag(event, engine, (target) => add(entry, target));
                    }}
                    onClick={() => void add(entry)}
                  >
                    <span className="spatial-object-visual" aria-hidden>
                      <span
                        className="spatial-object-poster"
                        style={spatialLibrarySwatch(entry.index)}
                      />
                    </span>
                    <Plus size={15} className="spatial-object-add" aria-hidden />
                    <span className="spatial-object-name">{t(entry.nameKey)}</span>
                  </button>
                ))}
              </div>
              {!filtered.length && (
                <p className="spatial-library-empty">{common("empty", { ns: "assets" })}</p>
              )}
            </div>
          </ScrollShadow>
        )}
        {tab === "vectors" && panel(vectorLibrary)}
        {tab === "packs" && panel(modelPacks)}
        <input
          ref={input}
          hidden
          type="file"
          accept=".glb,model/gltf-binary"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void add(file);
          }}
        />
        {error && (
          <p className="spatial-import-error" role="alert">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
