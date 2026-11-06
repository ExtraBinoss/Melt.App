import { useEffect, useRef, useState } from "react";
import type { ColorTarget, PaletteSwatch, SavedPalette } from "@musart/core";
import { validateSavedPalette } from "@musart/core";
import { useTranslation } from "react-i18next";
import { PaletteLibrary } from "../../services/palettes/library";
import type { PaletteRecord, PaletteSummary } from "../../services/palettes/library";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "../shared/IconButton";
import { Throbber } from "../ui/throbber/Throbber";
import { PalettePicker } from "./PalettePicker";
import { usePaletteEngine } from "./PaletteProvider";
import { DocumentColors } from "./DocumentColors";
import { usePaletteVariation } from "./use-palette-variation";
import { PaletteEditor } from "./PaletteEditor";
import { useDocumentPalette } from "./use-document-palette";
const DOCUMENT_PALETTE_ID = "document:detected";
export function PaletteBrowser({
  value,
  targets,
  onUse,
  beforeApply,
  onPreview,
  onCancel,
}: {
  value: string;
  targets: ColorTarget[];
  onUse: (value: string) => void;
  beforeApply: () => void;
  onPreview?: (value: string) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation("palettes"),
    engine = usePaletteEngine();
  const detected = useDocumentPalette(engine, value);
  const [viewingDocument, setViewingDocument] = useState(true);
  const documentPalette: SavedPalette = {
    id: DOCUMENT_PALETTE_ID,
    name: t("documentDetected"),
    colors: detected.colors,
  };
  const [mode, setMode] = useState<"pick" | "edit" | "document">("pick");
  const [items, setItems] = useState<PaletteSummary[]>([]),
    [selected, setSelected] = useState<PaletteRecord | null>(null),
    [draft, setDraft] = useState<SavedPalette | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [more, setMore] = useState(false);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const connection = useRef<PaletteLibrary | null>(null),
    lifetime = useRef({ epoch: 0, request: 0 });
  const [preview, setPreview] = useState<PaletteSwatch[] | null>(null);
  const variation = usePaletteVariation(engine, { beforeApply, onUse, onPreview, onCancel }, () => {
    setPreview(null);
    setError(t("changed"));
  });
  function cancelVariation() {
    variation.cancel();
    setPreview(null);
  }
  const importer = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const library = new PaletteLibrary();
    connection.current = library;
    const life = lifetime.current;
    const token = ++life.epoch;
    void library
      .list()
      .then(
        (page) => {
          if (token !== life.epoch) return;
          setItems(page.items);
          setMore(page.more);
        },
        (reason: unknown) => {
          if (token === lifetime.current.epoch)
            setError(reason instanceof Error ? reason.message : t("failed"));
        },
      )
      .catch((reason: unknown) => {
        if (token === life.epoch) setError(reason instanceof Error ? reason.message : t("failed"));
      })
      .finally(() => {
        if (token === lifetime.current.epoch) setBusy(false);
      });
    return () => {
      life.epoch++;
      life.request++;
      connection.current = null;
      library.dispose();
    };
  }, [t]);
  async function perform(
    action: (library: PaletteLibrary, isCurrent: () => boolean) => Promise<void>,
  ) {
    cancelVariation();
    const library = connection.current,
      token = lifetime.current.epoch,
      operation = ++lifetime.current.request;
    if (!library) return;
    const current = () =>
      lifetime.current.epoch === token && lifetime.current.request === operation;
    setBusy(true);
    setError("");
    try {
      await action(library, current);
    } catch (reason) {
      if (current()) setError(reason instanceof Error ? reason.message : t("failed"));
    } finally {
      if (current()) setBusy(false);
    }
  }
  function load(id: string) {
    if (id === DOCUMENT_PALETTE_ID) {
      cancelVariation();
      setViewingDocument(true);
      return;
    }
    void perform(async (library, current) => {
      const record = await library.get(id);
      if (current()) {
        setSelected(record);
        setDraft(record);
        setViewingDocument(false);
      }
    });
  }
  async function reload(library: PaletteLibrary, current: () => boolean, after = cursors.at(-1)) {
    const page = await library.list(after);
    if (current()) {
      setItems(page.items);
      setMore(page.more);
    }
  }
  function save(palette: SavedPalette, asNew: boolean) {
    const copy = asNew
      ? {
          ...palette,
          id: crypto.randomUUID(),
          colors: palette.colors.map((color) => ({ ...color, id: crypto.randomUUID() })),
        }
      : palette;
    void perform(async (library, current) => {
      const record = await library.save(copy, asNew ? null : (selected?.revision ?? null));
      if (current()) {
        setSelected(record);
        setDraft(record);
        setViewingDocument(false);
        setMode("pick");
      }
      await reload(library, current);
    });
  }
  function use(color: PaletteSwatch, link: boolean) {
    try {
      cancelVariation();
      beforeApply();
      if (link && engine && targets.length) {
        const colorId = viewingDocument ? crypto.randomUUID() : color.id;
        engine.transaction([
          {
            type: "setDocumentColors",
            colors: [{ id: colorId, name: color.name, value: color.value }],
          },
          { type: "linkDocumentColor", targets, colorId },
        ]);
      } else onUse(color.value);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("failed"));
    }
  }
  function previewColors(colors: PaletteSwatch[]) {
    try {
      variation.preview(colors);
      setPreview(colors);
      setError("");
    } catch (reason) {
      cancelVariation();
      setError(reason instanceof Error ? reason.message : t("failed"));
    }
  }
  function applyVariation(colors: PaletteSwatch[]) {
    if (!draft) return;
    try {
      variation.apply(colors);
      setPreview(null);
      setSelected(null);
      setDraft({
        id: crypto.randomUUID(),
        name: draft.name ? t("variationName", { name: draft.name }) : "",
        colors: colors.map((color) => ({ ...color, id: crypto.randomUUID() })),
      });
      setError("");
    } catch (reason) {
      cancelVariation();
      setError(reason instanceof Error ? reason.message : t("failed"));
    }
  }
  function exportPalette() {
    if (!draft) return;
    try {
      validateSavedPalette(draft);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${draft.name.replace(/[^\p{L}\p{N}_-]/gu, "-")}.palette.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("failed"));
    }
  }
  function createPalette() {
    cancelVariation();
    setSelected(null);
    setMode("edit");
    setDraft({
      id: crypto.randomUUID(),
      name: "",
      colors: (detected.colors.length
        ? detected.colors
        : [{ id: "current", name: "1", value }]
      ).map((color, index) => ({ ...color, id: crypto.randomUUID(), name: `${index + 1}` })),
    });
  }
  function closeEditor() {
    cancelVariation();
    setDraft(selected);
    setViewingDocument(!selected);
    setMode("pick");
  }
  return (
    <div className="palette-browser" aria-busy={busy} data-palette-mode={mode}>
      {mode === "pick" && (
        <PalettePicker
          items={items}
          selectedId={viewingDocument ? DOCUMENT_PALETTE_ID : selected?.id}
          palette={viewingDocument ? documentPalette : draft}
          detected={documentPalette}
          personal={!viewingDocument && !!selected}
          busy={busy}
          canLink={Boolean(engine && targets.length)}
          onLoad={load}
          onNew={createPalette}
          onUse={use}
          onEdit={() => {
            if (viewingDocument) createPalette();
            else setMode("edit");
          }}
          onDuplicate={() => draft && save({ ...draft, name: `${draft.name} 2` }, true)}
          onDelete={() => {
            if (selected)
              void perform(async (library, current) => {
                await library.delete(selected.id, selected.revision);
                if (current()) {
                  setSelected(null);
                  setDraft(null);
                  setViewingDocument(true);
                }
                await reload(library, current);
              });
          }}
          onImport={() => importer.current?.click()}
          onExport={exportPalette}
          onDocument={engine ? () => setMode("document") : undefined}
        />
      )}
      {mode === "edit" && draft && (
        <PaletteEditor
          key={draft.id}
          palette={draft}
          value={value}
          busy={busy}
          onChange={setDraft}
          onSave={save}
          onClose={closeEditor}
          preview={preview}
          onPreview={previewColors}
          onCancelPreview={cancelVariation}
          onApplyVariation={applyVariation}
        />
      )}
      {mode === "document" && engine && (
        <>
          <div className="palette-picker-heading">
            <IconButton label={t("cancel")} onClick={() => setMode("pick")}>
              <ArrowLeft size={16} />
            </IconButton>
            <span>{t("linkedColors")}</span>
          </div>
          <DocumentColors
            engine={engine}
            targets={targets}
            value={value}
            beforeApply={() => {
              cancelVariation();
              beforeApply();
            }}
          />
        </>
      )}
      <input
        ref={importer}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void perform(async (library, current) => {
            if (file.size > 100000) throw Error(t("tooLarge"));
            const data: unknown = JSON.parse(await file.text());
            validateSavedPalette(data);
            const imported = {
              ...data,
              id: crypto.randomUUID(),
              colors: data.colors.map((color) => ({ ...color, id: crypto.randomUUID() })),
            };
            const record = await library.save(imported, null);
            if (current()) {
              setSelected(record);
              setDraft(record);
              setMode("pick");
            }
            await reload(library, current);
          });
        }}
      />
      {mode === "pick" && (cursors.length > 1 || more) && (
        <div className="palette-pagination">
          {cursors.length > 1 && (
            <IconButton
              label={t("previous")}
              disabled={busy}
              onClick={() => {
                const next = cursors.slice(0, -1);
                setCursors(next);
                void perform((library, current) => reload(library, current, next.at(-1)));
              }}
            >
              <ChevronLeft size={14} />
            </IconButton>
          )}
          {more && (
            <IconButton
              label={t("next")}
              disabled={busy}
              onClick={() => {
                const after = items.at(-1)!.id;
                setCursors([...cursors, after]);
                void perform((library, current) => reload(library, current, after));
              }}
            >
              <ChevronRight size={14} />
            </IconButton>
          )}
        </div>
      )}
      {busy && <Throbber label={t("loading")} size={18} variant="dots" />}
      {(error || detected.error) && (
        <p role="alert" className="palette-error">
          {error || detected.error}
        </p>
      )}
    </div>
  );
}
