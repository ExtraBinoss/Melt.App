import { useState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { captureEffectTreatment, type Effect, type EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../../shared/IconButton";
import { EffectPresetStore, type SavedTreatment } from "../../../../services/effect-presets/store";
import { TreatmentNameForm } from "./TreatmentNameForm";
import "./messages";
import "./presets.css";
export function SaveTreatment({
  engine,
  effects,
  kind,
  disabled,
  onSaved,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  onStart,
}: {
  engine?: EnginePort;
  effects: readonly Effect[];
  kind: "effect" | "stack";
  disabled?: boolean;
  onSaved?: (saved: SavedTreatment) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  onStart?: () => void;
}) {
  const { t } = useTranslation("effectPresets");
  const [localOpen, setLocalOpen] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  // Form owns the asynchronous store so disposal also aborts accepted but uncommitted writes.
  return (
    <div className="treatment-save">
      {!hideTrigger && !open && (
        <IconButton
          label={t(kind === "stack" ? "saveStack" : "save")}
          disabled={disabled || busy || !engine || !effects.length}
          onClick={() => {
            onStart?.();
            setOpen(true);
          }}
        >
          <Plus size={14} />
        </IconButton>
      )}
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
    <TreatmentNameForm
      label={t(kind === "stack" ? "stackName" : "name")}
      name={name}
      onName={onName}
      busy={busy}
      error={error}
      onCancel={onClose}
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
    />
  );
}
