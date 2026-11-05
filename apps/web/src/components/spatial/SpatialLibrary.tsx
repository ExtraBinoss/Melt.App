import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Box, Plus, Type, Upload } from "lucide-react";
import type { EnginePort } from "@musart/core";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { IconButton } from "../shared/IconButton";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { SegmentedTabs } from "../shared/segmented/SegmentedTabs";
import { importSpatialModel, insertSpatialObject } from "../../services/assets/spatial-import";
import { SpatialLibraryModels } from "../../services/assets/spatial-library";
import {
  SPATIAL_LIBRARY_MODELS,
  SPATIAL_LIBRARY_SHAPES,
  spatialLibrarySwatch,
  type SpatialLibraryEntry,
} from "./library/catalog";
import {
  SpatialLibraryPreview,
  type SpatialLibraryPreviewHandle,
} from "./library/SpatialLibraryPreview";
import "./messages";
import "./spatial.css";
import "./library/library.css";
export function SpatialLibrary({
  engine,
  tooltipSide,
  vectorLibrary,
  modelPacks,
}: {
  engine: EnginePort;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  vectorLibrary?: { label: string; content: ReactNode };
  modelPacks?: { label: string; content: ReactNode };
}) {
  const { t } = useTranslation("spatial");
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [tab, setTab] = useState("shapes"),
    [selected, setSelected] = useState<SpatialLibraryEntry>(SPATIAL_LIBRARY_SHAPES[0]!);
  const store = useMemo(() => new SpatialLibraryModels(), []);
  const input = useRef<HTMLInputElement>(null),
    preview = useRef<SpatialLibraryPreviewHandle>(null),
    pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      store.clear();
    },
    [store],
  );
  const entries = tab === "models" ? SPATIAL_LIBRARY_MODELS : SPATIAL_LIBRARY_SHAPES;
  const native = tab === "shapes" || tab === "models";
  async function add(entry: SpatialLibraryEntry | "text" | File) {
    if (busy) return;
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    const origin = engine.getSnapshot();
    setBusy(true);
    setError("");
    try {
      await preview.current?.stop().catch(() => {});
      controller.signal.throwIfAborted();
      if (
        engine.getSnapshot().project !== origin.project ||
        engine.getSnapshot().pageId !== origin.pageId
      ) {
        setOpen(false);
        return;
      }
      setOpen(false);
      if (entry instanceof File) await importSpatialModel(engine, entry, controller.signal);
      else if (entry === "text") insertSpatialObject(engine, "text", t("primitives.text"));
      else if (entry.kind === "shape") insertSpatialObject(engine, entry.source, t(entry.nameKey));
      else {
        const asset = await store.load(entry.model, controller.signal),
          blob = await (await fetch(asset.dataUrl, { signal: controller.signal })).blob();
        controller.signal.throwIfAborted();
        if (
          engine.getSnapshot().project !== origin.project ||
          engine.getSnapshot().pageId !== origin.pageId
        )
          return;
        await importSpatialModel(
          engine,
          new File([blob], `${entry.id}.glb`, { type: "model/gltf-binary" }),
          controller.signal,
          { name: t(entry.nameKey), useModelMaterials: false },
        );
      }
    } catch (cause) {
      if (
        !controller.signal.aborted &&
        !(cause instanceof DOMException && cause.name === "AbortError")
      ) {
        setError(t("errors.import"));
        setOpen(true);
      }
    } finally {
      if (pending.current === controller) pending.current = null;
      setBusy(false);
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) pending.current?.abort();
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
        side="right"
        align="start"
        className="spatial-library"
        aria-label={t("objects")}
        data-canvas-control
      >
        {native && (
          <SpatialLibraryPreview
            ref={preview}
            entry={selected}
            store={store}
            onError={() => setError(t("errors.render"))}
          />
        )}
        {native && (
          <div className="spatial-library-heading">
            <span>{t(selected.nameKey)}</span>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                void add(selected);
              }}
            >
              <Plus size={14} />
              {t("add")}
            </Button>
          </div>
        )}
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
            setTab(value);
            setSelected((value === "models" ? SPATIAL_LIBRARY_MODELS : SPATIAL_LIBRARY_SHAPES)[0]!);
            setError("");
          }}
        />
        {native && (
          <ScrollShadow fade="mask">
            <div className="spatial-library-list">
              <div className="spatial-objects">
                {entries.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    disabled={busy}
                    className="spatial-object"
                    aria-label={t(entry.nameKey)}
                    aria-pressed={selected.id === entry.id}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== "touch") {
                        setSelected(entry);
                        setError("");
                      }
                    }}
                    onFocus={() => {
                      setSelected(entry);
                      setError("");
                    }}
                    onClick={() => {
                      setSelected(entry);
                      setError("");
                    }}
                  >
                    <span
                      className="spatial-object-poster"
                      aria-hidden
                      style={spatialLibrarySwatch(entry.index)}
                    />
                    <span>{t(entry.nameKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          </ScrollShadow>
        )}
        {tab === "vectors" && vectorLibrary?.content}
        {tab === "packs" && modelPacks?.content}
        {native && (
          <div className="spatial-library-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                void add("text");
              }}
            >
              <Type size={14} />
              {t("primitives.text")}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
              <Upload size={14} />
              {t("importModel")}
            </Button>
          </div>
        )}
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
