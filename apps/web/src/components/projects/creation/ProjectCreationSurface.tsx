import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { NewProjectOptions } from "../../../state/contracts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { NewProjectForm } from "./NewProjectForm";
export interface CreationDialogProps {
  open: boolean;
  busy: boolean;
  trigger: RefObject<HTMLElement | null>;
  onClose: () => void;
  onCreate: (options: NewProjectOptions) => void;
}

export function ProjectCreationSurface({
  open,
  busy,
  trigger,
  onClose,
  onCreate,
}: CreationDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        className="creation-dialog"
        showCloseButton={!busy}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (trigger.current?.isConnected) {
            event.preventDefault();
            trigger.current.focus({ preventScroll: true });
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("creation:title")}</DialogTitle>
          <DialogDescription>{t("creation:hint")}</DialogDescription>
        </DialogHeader>
        <NewProjectForm disabled={busy} onCreate={onCreate} />
      </DialogContent>
    </Dialog>
  );
}
