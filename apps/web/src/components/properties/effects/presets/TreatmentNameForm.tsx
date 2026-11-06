import type { FormEvent } from "react";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "../../../ui/input";
import { IconButton } from "../../../shared/IconButton";

/** Save and rename share the same compact, keyboard-accessible name entry. */
export function TreatmentNameForm({
  label,
  name,
  onName,
  busy,
  onSubmit,
  onCancel,
  error,
}: {
  label: string;
  name: string;
  onName: (name: string) => void;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  error?: string;
}) {
  const { t } = useTranslation("effectPresets");
  return (
    <form
      className="treatment-name-form"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" && !busy) {
          event.preventDefault();
          onCancel();
        }
      }}
      onSubmit={onSubmit}
    >
      <Input
        autoFocus
        maxLength={120}
        aria-label={label}
        placeholder={label}
        value={name}
        onChange={(event) => onName(event.target.value)}
        disabled={busy}
      />
      <IconButton label={t("confirm")} type="submit" disabled={busy || !name.trim()}>
        <Check size={14} aria-hidden="true" />
      </IconButton>
      <IconButton label={t("cancel")} type="button" disabled={busy} onClick={onCancel}>
        <X size={14} aria-hidden="true" />
      </IconButton>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
