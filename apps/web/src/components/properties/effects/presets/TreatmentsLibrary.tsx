import { useEffect, useRef, useState } from "react";
import { captureEffectTreatment, type EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import { applyTreatment, type TreatmentTarget } from "../../../../services/effect-presets/apply";
import type { TreatmentHeader } from "../../../../services/effect-presets/store";
import { useEffectLibrary } from "./use-library";
import "./messages";
import "./presets.css";
export interface TreatmentContext {
  engine: EnginePort;
  target: TreatmentTarget;
  disabled?: boolean;
}
/** Mounted on demand; list metadata is bounded and payloads are read only for explicit actions. */
export function TreatmentsLibrary({ engine, target, disabled }: TreatmentContext) {
  const { t } = useTranslation("effectPresets");
  const library = useEffectLibrary();
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null),
    [name, setName] = useState("");
  const operationId = useRef(0);
  useEffect(
    () => () => {
      operationId.current++;
    },
    [],
  );
  async function act(
    header: TreatmentHeader,
    action: "append" | "replace" | "rename" | "delete" | "update",
  ) {
    if (busy || disabled) return;
    const owned = ++operationId.current,
      origin = engine.getSnapshot();
    setBusy(true);
    library.setError("");
    try {
      const store = library.getStore();
      if (action === "delete") await store.delete(header);
      else {
        const record = await store.get(header.id);
        if (owned !== operationId.current) return;
        if (!record || record.revision !== header.revision) throw Error(t("unavailable"));
        if (action === "append" || action === "replace")
          applyTreatment(engine, origin, target, record.treatment, action);
        else if (action === "rename") {
          await store.save({ ...record.treatment, name: name.trim() }, record.revision);
          setRenaming(null);
        } else {
          if (
            engine.getSnapshot().project !== origin.project ||
            engine.getSnapshot().selection !== origin.selection
          )
            throw Error("stale");
          const page = origin.project.pages.find((page) => page.id === target.pageId);
          const effects =
            target.layerIds?.length === 1
              ? page?.layers.find((layer) => layer.id === target.layerIds![0])?.effects
              : !target.layerIds
                ? page?.effects
                : undefined;
          if (!effects) throw Error(t("stale"));
          await store.save(
            captureEffectTreatment(record.id, record.name, effects, origin.project.assets, "stack"),
            record.revision,
          );
        }
      }
      if (owned === operationId.current) await library.refresh();
    } catch (reason) {
      if (owned === operationId.current)
        library.setError(
          reason instanceof Error && reason.message === "stale"
            ? t("stale")
            : reason instanceof Error
              ? reason.message
              : t("failure"),
        );
    } finally {
      if (owned === operationId.current) setBusy(false);
    }
  }
  return (
    <div
      className="treatments-library"
      data-my-treatments=""
      onKeyDown={(event) => {
        if (event.key !== "Escape") event.stopPropagation();
      }}
    >
      {library.items
        .filter((item) => item.kind === "stack")
        .map((item) => (
          <div className="treatment-row" key={item.id}>
            <strong>{item.name}</strong>
            <div className="treatment-row-actions">
              <Button
                size="sm"
                disabled={disabled || busy}
                onClick={() => void act(item, "append")}
              >
                {t("append")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || busy}
                onClick={() => void act(item, "replace")}
              >
                {t("replace")}
              </Button>
            </div>
            <div className="treatment-row-actions">
              <Button
                size="sm"
                variant="ghost"
                disabled={
                  disabled || busy || Boolean(target.layerIds && target.layerIds.length !== 1)
                }
                onClick={() => void act(item, "update")}
              >
                {t("update")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setRenaming(item.id);
                  setName(item.name);
                }}
              >
                {t("rename")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void act(item, "delete")}
              >
                {t("delete")}
              </Button>
            </div>
            {renaming === item.id && (
              <form
                className="treatment-name-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(item, "rename");
                }}
              >
                <Input
                  autoFocus
                  aria-label={t("stackName")}
                  value={name}
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                />
                <Button size="sm" disabled={busy || !name.trim()}>
                  {t("confirm")}
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setRenaming(null)}>
                  {t("cancel")}
                </Button>
              </form>
            )}
          </div>
        ))}
      {!library.busy && !library.items.some((item) => item.kind === "stack") && (
        <p className="muted-description">{t("empty")}</p>
      )}
      {(busy || library.busy) && <small>{t("loading")}</small>}
      {library.before && (
        <Button
          size="sm"
          disabled={busy || library.busy}
          onClick={() => void library.refresh(library.before!)}
        >
          {t("more")}
        </Button>
      )}
      {library.error && <p role="alert">{library.error}</p>}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void library.refresh()}>
        {t("reload")}
      </Button>
    </div>
  );
}
