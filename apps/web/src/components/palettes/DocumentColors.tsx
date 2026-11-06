import { useState, useSyncExternalStore } from "react";
import { colorOwner, colorTargets } from "@musart/core";
import type { ColorTarget, EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
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
  return (
    <section className="palette-document" aria-label={t("document")}>
      <strong>{t("document")}</strong>
      <p className="muted-description">{t("globalHint")}</p>
      {linked && (
        <>
          <p>
            {t("linked", {
              name: linked.name,
              count: uses.filter((use) => use.colorId === linked.id).length,
            })}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              run(() => engine.execute({ type: "linkDocumentColor", targets, colorId: null }))
            }
          >
            {t("detach")}
          </Button>
        </>
      )}
      <div className="palette-swatches">
        {project.colors?.map((color) => (
          <div className="palette-document-color" key={color.id}>
            <button
              type="button"
              className="palette-swatch"
              style={{ background: color.value }}
              title={`${color.name} · ${uses.filter((use) => use.colorId === color.id).length}`}
              aria-label={color.name}
              disabled={!targets.length}
              onClick={() =>
                run(() => engine.execute({ type: "linkDocumentColor", targets, colorId: color.id }))
              }
            />
            <span>
              {color.name} · {uses.filter((use) => use.colorId === color.id).length}
            </span>
          </div>
        ))}
      </div>
      {!project.colors?.length && <p>{t("noColors")}</p>}
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
      <div className="palette-actions">
        <Button
          size="sm"
          variant="outline"
          disabled={!name.trim() || !targets.length}
          onClick={() =>
            run(() => {
              const id = crypto.randomUUID();
              engine.transaction([
                { type: "setDocumentColors", colors: [{ id, name: name.trim(), value: edit }] },
                { type: "linkDocumentColor", targets, colorId: id },
              ]);
            })
          }
        >
          {t("makeGlobal")}
        </Button>
        {linked && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                run(() =>
                  engine.execute({
                    type: "setDocumentColors",
                    colors: [{ ...linked, name: name.trim() || linked.name, value: edit }],
                  }),
                )
              }
            >
              {t("editGlobal")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                run(() => engine.execute({ type: "deleteDocumentColor", id: linked.id }))
              }
            >
              {t("remove")}
            </Button>
          </>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
