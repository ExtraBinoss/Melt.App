import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SpatialLibraryModels } from "../../../services/assets/spatial-library";
import { spatialLibrarySwatch, type SpatialLibraryEntry } from "./catalog";
import { createSpatialLibraryPreview } from "./preview-owner";
export interface SpatialLibraryPreviewHandle {
  stop(): Promise<void>;
}
export const SpatialLibraryPreview = forwardRef<
  SpatialLibraryPreviewHandle,
  { entry: SpatialLibraryEntry; store: SpatialLibraryModels; onError: (error: unknown) => void }
>(function SpatialLibraryPreview({ entry, store, onError }, ref) {
  const { t } = useTranslation("spatial");
  const host = useRef<HTMLDivElement>(null),
    owner = useRef<ReturnType<typeof createSpatialLibraryPreview> | null>(null);
  const error = useRef(onError);
  useEffect(() => {
    error.current = onError;
  }, [onError]);
  useEffect(() => {
    if (!host.current) return;
    const next = createSpatialLibraryPreview(host.current, store, (value) => error.current(value));
    owner.current = next;
    return () => {
      owner.current = null;
      void next.stop().catch(() => {});
    };
  }, [store]);
  useEffect(() => {
    void owner.current?.setEntry(entry);
  }, [entry, store]);
  useImperativeHandle(
    ref,
    () => ({
      async stop() {
        await owner.current?.stop();
      },
    }),
    [],
  );
  return (
    <div
      className="spatial-library-preview"
      role="group"
      tabIndex={0}
      aria-label={t("preview")}
      title={t("orbit")}
      data-ready="false"
    >
      <span
        aria-hidden
        className="spatial-library-preview-poster"
        style={spatialLibrarySwatch(entry.index)}
      />
      <div ref={host} className="spatial-library-live" />
    </div>
  );
});
