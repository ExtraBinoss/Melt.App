import { useAtom } from "jotai";
import type { PrimitiveAtom } from "jotai";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CreationDialogProps } from "./ProjectCreationSurface";
import type { ProjectDialogProps } from "../ProjectDialog";
import type { NewProjectOptions } from "../../../state/contracts";
import { Throbber } from "../../ui/throbber/Throbber";
const ProjectCreationSurface = lazy(() =>
  import("./ProjectCreationSurface").then((module) => ({ default: module.ProjectCreationSurface })),
);
/** Opening the accessory does not rebuild the library and its preview surfaces. */
export function CreationDialogHost({
  state,
  ...props
}: Omit<CreationDialogProps, "open" | "onClose"> & { state: PrimitiveAtom<boolean> }) {
  const [open, setOpen] = useAtom(state);
  const [visited, setVisited] = useState(open);
  const { t } = useTranslation("brand");
  if (open && !visited) setVisited(true);
  if (!open && !visited) return null;
  return (
    <Suspense fallback={<Throbber size={28} label={t("loading")} />}>
      <ProjectCreationSurface {...props} open={open} onClose={() => setOpen(false)} />
    </Suspense>
  );
}

/** The editor's direct creation route needs no library state, subscriptions or metadata. */
export function StandaloneProjectCreation({ services, onTask, onClose }: ProjectDialogProps) {
  const [busy, setBusy] = useState(false);
  const { t } = useTranslation("brand");
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
    <Suspense fallback={<Throbber size={28} label={t("loading")} />}>
      <ProjectCreationSurface
        open
        busy={busy}
        trigger={trigger}
        onClose={onClose}
        onCreate={(options) => void create(options)}
      />
    </Suspense>
  );
}
