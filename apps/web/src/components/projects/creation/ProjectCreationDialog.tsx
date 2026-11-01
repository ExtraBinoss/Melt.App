import { useAtom } from "jotai";
import type { PrimitiveAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { NewProjectOptions } from "../../../state/contracts";
import type { ProjectDialogProps } from "../ProjectDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { NewProjectForm } from "./NewProjectForm";

interface CreationDialogProps {
  open: boolean;
  busy: boolean;
  trigger: RefObject<HTMLElement | null>;
  onClose: () => void;
  onCreate: (options: NewProjectOptions) => void;
}

function ProjectCreationDialog({ open, busy, trigger, onClose, onCreate }: CreationDialogProps) {
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

/** Opening the accessory does not rebuild the library and its preview surfaces. */
export function CreationDialogHost({
  state,
  ...props
}: Omit<CreationDialogProps, "open" | "onClose"> & { state: PrimitiveAtom<boolean> }) {
  const [open, setOpen] = useAtom(state);
  return <ProjectCreationDialog {...props} open={open} onClose={() => setOpen(false)} />;
}

/** The editor's direct creation route needs no library state, subscriptions or metadata. */
export function StandaloneProjectCreation({ services, onTask, onClose }: ProjectDialogProps) {
  const [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const scope = useRef({ alive: true, pending: false });
  useEffect(() => {
    const current = scope.current;
    current.alive = true;
    return () => {
      current.alive = false;
    };
  }, []);
  async function create(options: NewProjectOptions) {
    const current = scope.current;
    if (current.pending || !current.alive) return;
    current.pending = true;
    setBusy(true);
    try {
      const ok = await onTask(() => services.createProject(options));
      if (ok && current.alive) onClose();
    } finally {
      current.pending = false;
      if (current.alive) setBusy(false);
    }
  }
  return (
    <ProjectCreationDialog
      open
      busy={busy}
      trigger={trigger}
      onClose={onClose}
      onCreate={(options) => void create(options)}
    />
  );
}
