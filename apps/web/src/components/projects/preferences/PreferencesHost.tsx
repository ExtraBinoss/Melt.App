import { lazy, Suspense, useState, type ComponentProps } from "react";
import { useAtom, type PrimitiveAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Throbber } from "../../ui/throbber/Throbber";
const PreferencesDialog = lazy(() =>
  import("./PreferencesDialog").then((module) => ({ default: module.PreferencesDialog })),
);

/** Keep shortcuts, preference panels and their CSS out of initial library navigation. */
export function LazyPreferencesDialog(props: ComponentProps<typeof PreferencesDialog>) {
  const { t } = useTranslation("brand");
  return (
    <Suspense fallback={<Throbber size={28} label={t("loading")} />}>
      <PreferencesDialog {...props} />
    </Suspense>
  );
}

/** After the first opening, retain the closing animation and local dialog lifetime. */
export function PreferencesHost({ state }: { state: PrimitiveAtom<boolean> }) {
  const [open, setOpen] = useAtom(state);
  const [visited, setVisited] = useState(open);
  if (open && !visited) setVisited(true);
  if (!open && !visited) return null;
  return <LazyPreferencesDialog open={open} onClose={() => setOpen(false)} />;
}
