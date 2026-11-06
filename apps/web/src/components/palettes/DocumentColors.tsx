import { useState, useSyncExternalStore } from "react";
import { Check, Link, Plus, Trash2 } from "lucide-react";
import { colorOwner, colorTargets } from "@musart/core";
import type { ColorTarget, EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { IconButton } from "../shared/IconButton";
export function DocumentColors({
  engine,
  targets,
  value,
  beforeApply,
}: {
  engine: EnginePort;
  targets: ColorTarget[];
  value: string;
  beforeApply: () => void;
}) {
  const { t } = useTranslation("palettes");
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot),
    project = snapshot.project;
  const [name, setName] = useState(""),
    [edit, setEdit] = useState(value),
    [error, setError] = useState("");
  const uses = colorTargets(project);
  const linkedId = targets.length
    ? (() => {
        try {
          return colorOwner(project, targets[0]!).colorLinks?.[targets[0]!.property];
        } catch {
          return undefined;
        }
      })()
    : undefined;
  const linked = project.colors?.find((color) => color.id === linkedId);
  const address = JSON.stringify([linked?.id, linked?.name, linked?.value, value]);
  const [source, setSource] = useState(address);
  if (source !== address) {
    setSource(address);
    setEdit(linked?.value ?? value);
    setName(linked?.name ?? "");
  }
  function run(action: () => void) {
    try {
      beforeApply();
      action();
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("failed"));
    }
  }
  function create() {
    const id = crypto.randomUUID();
    engine.transaction([
      { type: "setDocumentColors", colors: [{ id, name: name.trim(), value: edit }] },
      { type: "linkDocumentColor", targets, colorId: id },
    ]);
  }
  return (
    <section className="palette-document" aria-label={t("document")}>
      <div className="palette-document-swatches">
        {project.colors?.map((color) => (
          <Button
            key={color.id}
            variant="ghost"
            className="palette-swatch"
            style={{ background: color.value }}
            title={`${color.name} · ${uses.filter((use) => use.colorId === color.id).length}`}
            aria-label={color.name}
            aria-pressed={color.id === linkedId}
            disabled={!targets.length}
            onClick={() =>
              run(() => engine.execute({ type: "linkDocumentColor", targets, colorId: color.id }))
            }
          />
        ))}
      </div>
      <Input
        aria-label={t("globalName")}
        placeholder={t("globalName")}
        value={name}
        maxLength={100}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        aria-label={t("colorValue")}
        value={edit}
        onChange={(event) => setEdit(event.target.value)}
      />
      <div className="palette-edit-actions">
        <label className="palette-lock" title={t("link")}>
          <Link size={14} aria-hidden="true" />
          <Switch
            size="sm"
            aria-label={t("link")}
            checked={!!linked}
            disabled={!targets.length || (!linked && !name.trim())}
            onCheckedChange={(next) =>
              run(() =>
                next
                  ? create()
                  : engine.execute({ type: "linkDocumentColor", targets, colorId: null }),
              )
            }
          />
        </label>
        <IconButton
          label={t("makeGlobal")}
          disabled={!name.trim() || !targets.length}
          onClick={() => run(create)}
        >
          <Plus size={15} />
        </IconButton>
        {linked && (
          <>
            <IconButton
              label={t("editGlobal")}
              disabled={!name.trim()}
              onClick={() =>
                run(() =>
                  engine.execute({
                    type: "setDocumentColors",
                    colors: [{ ...linked, name: name.trim(), value: edit }],
                  }),
                )
              }
            >
              <Check size={15} />
            </IconButton>
            <IconButton
              label={t("remove")}
              onClick={() =>
                run(() => engine.execute({ type: "deleteDocumentColor", id: linked.id }))
              }
            >
              <Trash2 size={14} />
            </IconButton>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="palette-error">
          {error}
        </p>
      )}
    </section>
  );
}
