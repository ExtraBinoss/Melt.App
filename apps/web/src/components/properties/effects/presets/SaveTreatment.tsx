import { useState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { captureEffectTreatment, type Effect, type EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import { IconButton } from "../../../shared/IconButton";
import { EffectPresetStore, type SavedTreatment } from "../../../../services/effect-presets/store";
import "./messages";
import "./presets.css";
export function SaveTreatment({
  engine,
  effects,
  kind,
  disabled,
  onSaved,
}: {
  engine?: EnginePort;
  effects: readonly Effect[];
  kind: "effect" | "stack";
  disabled?: boolean;
  onSaved?: (saved: SavedTreatment) => void;
}) {
  const { t } = useTranslation("effectPresets");
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  // Form owns the asynchronous store so disposal also aborts accepted but uncommitted writes.
  return (
    <div className="treatment-save">
      <IconButton
        label={t(kind === "stack" ? "saveStack" : "save")}
        disabled={disabled || busy || !engine || !effects.length}
        onClick={() => setOpen(!open)}
      >
        <Plus size={14} />
      </IconButton>
      {open && (
        <SaveForm
          key={kind}
          engine={engine!}
          effects={effects}
          kind={kind}
          name={name}
          onName={setName}
          busy={busy}
          onBusy={setBusy}
          error={error}
          onError={setError}
          onClose={() => {
            setOpen(false);
            setName("");
            setError("");
          }}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
function SaveForm({
  engine,
  effects,
  kind,
  name,
  onName,
  busy,
  onBusy,
  error,
  onError,
  onClose,
  onSaved,
}: {
  engine: EnginePort;
  effects: readonly Effect[];
  kind: "effect" | "stack";
  name: string;
  onName: (name: string) => void;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  error: string;
  onError: (error: string) => void;
  onClose: () => void;
  onSaved?: (saved: SavedTreatment) => void;
}) {
  const { t } = useTranslation("effectPresets");
  const store = useRef<EffectPresetStore | null>(null);
  const mounted = useRef(true);
  const saving = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      store.current?.dispose();
      store.current = null;
    };
  }, []);
  return (
    <form
      className="treatment-name-form"
      onKeyDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        if (saving.current) return;
        saving.current = true;
        const origin = engine.getSnapshot();
        onBusy(true);
        onError("");
        void (async () => {
          try {
            const owned = (store.current ??= new EffectPresetStore());
            const treatment = captureEffectTreatment(
              crypto.randomUUID(),
              name,
              effects,
              origin.project.assets,
              kind,
            );
            const saved = await owned.save(treatment);
            if (mounted.current) {
              if (engine.getSnapshot().project === origin.project) onSaved?.(saved);
              onBusy(false);
              onClose();
            }
          } catch (reason) {
            if (mounted.current) onError(reason instanceof Error ? reason.message : t("failure"));
          } finally {
            saving.current = false;
            if (mounted.current) onBusy(false);
          }
        })();
      }}
    >
      <Input
        autoFocus
        maxLength={120}
        aria-label={t(kind === "stack" ? "stackName" : "name")}
        value={name}
        onChange={(event) => onName(event.target.value)}
        disabled={busy}
      />
      <Button size="sm" type="submit" disabled={busy || !name.trim()}>
        {t("confirm")}
      </Button>
      <Button size="sm" type="button" variant="ghost" disabled={busy} onClick={onClose}>
        {t("cancel")}
      </Button>
      <small>{t("omitted")}</small>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
