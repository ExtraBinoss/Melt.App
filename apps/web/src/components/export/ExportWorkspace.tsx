import { ExportFramingControls, exportFraming } from "./ExportFramingControls";
import type { FrameChoice } from "../../ui/studio/framing/FramePresetPicker";
import { getStudioViewport } from "../../ui/studio/framing/viewport";
import { useWorkspaceMode } from "../../ui/studio/workspace-mode";
import { useProjectPreferences } from "../workspace/preferences/context";
import { createRenderActivity } from "../../services/session/render-activity";
import { InfoTooltip } from "../shared/InfoTooltip";
import { usePreviewAdmission } from "./use-preview-admission";
import type { RefObject } from "react";
import { freezeEffectPreviews } from "../../state/session/effect-preview";
import { createMotionTransport } from "../../services/motion/transport";
import { SegmentedTabs } from "../shared/segmented/SegmentedTabs";
import "./workspace.css";
import { memo, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../state/contracts";
import { getExportJobs, type ExportKind } from "../../services/export/jobs";
import { SelectField } from "../shared/SelectField";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { ImageExportPane } from "./ImageExportPane";
import { MotionExportPane } from "./MotionExportPane";
import { TimelapseExportPane } from "./TimelapseExportPane";

const empty: readonly string[] = Object.freeze([]);
export const ExportWorkspace = memo(function ExportWorkspace({
  engine,
  services,
  initialCompositionId,
  initialKind,
  entrance,
  onClose,
}: {
  engine: EnginePort;
  services: EditorServices;
  initialCompositionId?: string;
  initialKind?: ExportKind;
  entrance?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const { t } = useTranslation("exportPanel");
  const previewActive = usePreviewAdmission(entrance);
  useLayoutEffect(() => {
    freezeEffectPreviews(engine);
    createMotionTransport(engine).pause();
  }, [engine]);
  const [origin] = useState(() => engine.getSnapshot());
  const [pageId, setPageId] = useState(initialCompositionId ?? origin.pageId);
  const page = origin.project.pages.find((item) => item.id === pageId) ?? origin.project.pages[0]!;
  const [kind, setKind] = useState<ExportKind>(
    initialKind ?? (page.motion?.mode === "motion" ? "motion" : "image"),
  );
  const workspace = useWorkspaceMode();
  const preferences = useProjectPreferences();
  const [capture] = useState(() => {
    const view = getStudioViewport(engine).read();
    return workspace === "studio" &&
      view?.projectId === origin.project.id &&
      view.pageId === page.id
      ? { view, choice: page.captureGuides ?? preferences?.read("studioCapture") }
      : null;
  });
  const [frameChoice, setFrameChoice] = useState<FrameChoice>(
    () =>
      (capture?.choice && !capture.choice.full ? capture.choice : null) ?? {
        preset: "full",
        full: true,
        width: Math.max(1, Math.round(capture?.view.region.width ?? page.width)),
        height: Math.max(1, Math.round(capture?.view.region.height ?? page.height)),
      },
  );
  const [whole, setWhole] = useState(workspace === "studio");
  const [center, setCenter] = useState(false);
  const [allPages, setAllPages] = useState(false);
  const jobs = getExportJobs(engine);
  const busy = useSyncExternalStore(
    jobs.subscribe,
    () => jobs.pending,
    () => false,
  );
  useLayoutEffect(() => {
    if (!busy) return createRenderActivity(engine).holdForeground();
  }, [engine, busy]);
  const selected = page.id === origin.pageId ? origin.selection : empty;
  const selection = !whole && !allPages ? selected : empty;
  const capturedRegion =
    capture?.view.pageId === page.id && !selection.length && !allPages
      ? capture.view.region
      : undefined;
  const framing = useMemo(
    () => exportFraming(frameChoice, capturedRegion),
    [frameChoice, capturedRegion],
  );
  const controls = (
    <>
      <div className="export-field">
        <Label htmlFor="export-artboard">{t("chooseArtboard")}</Label>
        <SelectField
          id="export-artboard"
          label={t("chooseArtboard")}
          value={page.id}
          disabled={busy}
          options={origin.project.pages.map((item) => ({ value: item.id, label: item.name }))}
          onValueChange={(id) => {
            setPageId(id);
            setWhole(false);
            setAllPages(false);
            const next = origin.project.pages.find((item) => item.id === id)!;
            setFrameChoice({ preset: "full", full: true, width: next.width, height: next.height });
            if (kind !== "timelapse") setKind(next.motion?.mode === "motion" ? "motion" : "image");
          }}
        />
      </div>
      <div className="export-field">
        <Label>{t("output")}</Label>
        <SegmentedTabs
          mode="choice"
          size="compact"
          label={t("output")}
          value={kind}
          disabled={busy}
          items={[
            { value: "image", label: t("image") },
            ...(page.motion?.mode === "motion" ? [{ value: "motion", label: t("motion") }] : []),
            { value: "timelapse", label: t("timelapse") },
          ]}
          onValueChange={(value) => {
            setKind(value as ExportKind);
            setAllPages(false);
          }}
        />
      </div>
      <ExportFramingControls
        value={frameChoice}
        onChange={setFrameChoice}
        bounds={capturedRegion ?? page}
        disabled={busy}
      />
      {selected.length > 0 && (
        <label className="switch-row">
          <span>{t("whole")}</span>
          <Switch
            checked={whole || allPages}
            disabled={busy || allPages}
            aria-label={t("whole")}
            onCheckedChange={setWhole}
          />
        </label>
      )}
      {selection.length === 1 && (
        <div className="switch-row">
          <div className="export-label-help">
            <Label htmlFor="export-center-selection">{t("centerSelection")}</Label>
            <InfoTooltip label={t("centerSelection")}>{t("centerSelectionHint")}</InfoTooltip>
          </div>
          <Switch
            id="export-center-selection"
            aria-label={t("centerSelection")}
            checked={center}
            disabled={busy}
            onCheckedChange={setCenter}
          />
        </div>
      )}
      {(allPages || selection.length > 0) && (
        <p className="export-scope">
          {allPages
            ? t("allArtboards")
            : selection.length
              ? t("selection", { count: selection.length })
              : t("artboard", { name: page.name })}
        </p>
      )}
    </>
  );
  const scopedServices = useMemo(
    () => ({
      ...services,
      ...(services.previewExport
        ? {
            previewExport: (
              options: Parameters<NonNullable<EditorServices["previewExport"]>>[0],
              signal?: AbortSignal,
            ) => services.previewExport!({ ...options, pageId: page.id }, signal),
          }
        : {}),
    }),
    [services, page.id],
  );
  const props = {
    engine,
    services: scopedServices,
    origin,
    page,
    selection,
    centerSelection: center && selection.length === 1,
    framing,
    controls,
    onClose,
    previewActive,
  };
  return kind === "motion" ? (
    <MotionExportPane key={page.id} {...props} />
  ) : kind === "timelapse" ? (
    <TimelapseExportPane key={page.id} {...props} />
  ) : (
    <ImageExportPane key={page.id} {...props} allPages={allPages} onAllPagesChange={setAllPages} />
  );
});
