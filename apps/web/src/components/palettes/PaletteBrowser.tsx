import { useEffect, useRef, useState } from "react";
import type { ColorTarget, PaletteSwatch, SavedPalette } from "@musart/core";
import { validateSavedPalette, varyPalette } from "@musart/core";
import { useTranslation } from "react-i18next";
import { PaletteLibrary } from "../../services/palettes/library";
import type { PaletteRecord, PaletteSummary } from "../../services/palettes/library";
import { Button } from "../ui/button";
import { SelectField } from "../shared/SelectField";
import { usePaletteEngine } from "./PaletteProvider";
import { DocumentColors } from "./DocumentColors";
import { usePaletteVariation } from "./use-palette-variation";
import { PaletteEditor } from "./PaletteEditor";
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
          if (token === lifetime.current.epoch) {
            setItems(page.items);
            setMore(page.more);
          }
        },
        (reason: unknown) => {
          if (token === lifetime.current.epoch)
            setError(reason instanceof Error ? reason.message : t("failed"));
        },
      )
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
    void perform(async (library, current) => {
      const record = await library.get(id);
      if (current()) {
        setSelected(record);
        setDraft(record);
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
      }
      await reload(library, current);
    });
  }
  function use(color: PaletteSwatch, link: boolean) {
    try {
      cancelVariation();
      beforeApply();
      if (link && engine && targets.length)
        engine.transaction([
          {
            type: "setDocumentColors",
            colors: [{ id: color.id, name: color.name, value: color.value }],
          },
          { type: "linkDocumentColor", targets, colorId: color.id },
        ]);
      else onUse(color.value);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("failed"));
    }
  }
  function generate(colors: PaletteSwatch[]) {
    try {
      const next = varyPalette(colors, Math.random());
      variation.preview(next);
      setPreview(next);
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
        name: t("variationName", { name: draft.name }),
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
  return (
    <div className="palette-browser" aria-busy={busy}>
      <strong>{t("library")}</strong>
      <p className="muted-description">{t("hint")}</p>
      <SelectField
        label={t("library")}
        value={selected?.id ?? ""}
        disabled={busy || !items.length}
        options={items.map((item) => ({ value: item.id, label: item.name }))}
        onValueChange={load}
      />
      {!items.length && !busy && <p>{t("empty")}</p>}
      <div className="palette-actions">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            cancelVariation();
            setSelected(null);
            setDraft({
              id: crypto.randomUUID(),
              name: t("company"),
              colors: [{ id: crypto.randomUUID(), name: "1", value }],
            });
          }}
        >
          {t("new")}
        </Button>
        {selected && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => draft && save({ ...draft, name: `${draft.name} 2` }, true)}
            >
              {t("duplicate")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                void perform(async (library, current) => {
                  await library.delete(selected.id, selected.revision);
                  if (current()) {
                    setSelected(null);
                    setDraft(null);
                  }
                  await reload(library, current);
                });
              }}
            >
              {t("remove")}
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => importer.current?.click()}>
          {t("import")}
        </Button>
        {draft && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={exportPalette}>
            {t("export")}
          </Button>
        )}
      </div>
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
            }
            await reload(library, current);
          });
        }}
      />
      <div className="palette-actions">
        {cursors.length > 1 && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              const next = cursors.slice(0, -1);
              setCursors(next);
              void perform((library, current) => reload(library, current, next.at(-1)));
            }}
          >
            {t("previous")}
          </Button>
        )}
        {more && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              const after = items.at(-1)!.id;
              setCursors([...cursors, after]);
              void perform((library, current) => reload(library, current, after));
            }}
          >
            {t("next")}
          </Button>
        )}
      </div>
      {draft && (
        <PaletteEditor
          key={draft.id}
          palette={draft}
          value={value}
          busy={busy}
          onChange={setDraft}
          onSave={save}
          onUse={use}
          preview={preview}
          onPreview={generate}
          onCancelPreview={cancelVariation}
          onApplyVariation={applyVariation}
        />
      )}
      {busy && <p role="status">{t("loading")}</p>}
      {error && <p role="alert">{error}</p>}
      {engine && (
        <DocumentColors
          engine={engine}
          targets={targets}
          value={value}
          beforeApply={() => {
            cancelVariation();
            beforeApply();
          }}
        />
      )}
    </div>
  );
}
