import { estimateVideoBytes } from "./estimate";
import { exportSizeKey } from "../../services/export/measurements";
import { selectionComposition } from "@musart/core";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { createMotionPreview } from "@musart/render";
import { getExportJobs } from "../../services/export/jobs";
import { MotionExportPreview } from "./MotionExportPreview";
import { ExportLayout, ExportAdvanced } from "./ExportLayout";
import { useStartExport } from "./use-start-export";
import type { ExportPaneProps } from "./workspace-model";
import { SelectField } from "../shared/SelectField";
import { NumberInput } from "../shared/NumberInput";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";

export function MotionExportPane(props: ExportPaneProps) {
  const { engine, origin, page, selection, services } = props;
  const { t } = useTranslation("exportPanel");
  const jobs = getExportJobs(engine),
    busy = useSyncExternalStore(
      jobs.subscribe,
      () => jobs.pending,
      () => false,
    );
  const [scale, setScale] = useState(1),
    [container, setContainer] = useState<"auto" | "mp4" | "webm">("auto");
  const [staticSeconds, setStaticSeconds] = useState(2);
  const [fps, setFps] = useState("composition"),
    [bitrate, setBitrate] = useState(8_000_000),
    [audio, setAudio] = useState(true);
  const preview = useRef<ReturnType<typeof createMotionPreview> | null>(null);
  const receive = useCallback((source: ReturnType<typeof createMotionPreview> | null) => {
    preview.current = source;
  }, []);
  const scope = useMemo(
    () =>
      selection.length
        ? selectionComposition(page, selection, [], { centerInArtboard: props.centerSelection })
        : page,
    [page, selection, props.centerSelection],
  );
  const output = {
    width: Math.max(1, Math.round((props.framing?.width ?? scope.width) * scale)),
    height: Math.max(1, Math.round((props.framing?.height ?? scope.height) * scale)),
  };
  const animated = page.motion?.mode === "motion";
  const motion = animated ? page.motion! : null;
  const baseRate = motion?.frameRate ?? { numerator: 30, denominator: 1 };
  const staticDuration = useMemo(
    () => ({ value: Math.round(staticSeconds * 1000), rate: 1000 }),
    [staticSeconds],
  );
  const rate =
    fps === "composition"
      ? baseRate
      : { numerator: Number(fps.split("/")[0]), denominator: Number(fps.split("/")[1] ?? 1) };
  const duration = motion ? motion.duration.value / motion.duration.rate : staticSeconds;
  const hasAudio = Boolean(
    animated &&
    ((!selection.length && motion?.audioTracks?.length) ||
      scope.layers.some((layer) => layer.kind === "video")),
  );
  const sizeKey = exportSizeKey(origin.project, [
    "motion",
    page.id,
    selection,
    props.centerSelection ?? false,
    scale,
    props.framing,
    container,
    rate.numerator,
    rate.denominator,
    bitrate,
    audio,
    animated ? null : staticDuration,
  ]);
  const start = useStartExport(props, "motion", sizeKey);
  return (
    <ExportLayout
      {...props}
      submitLabel={t("exportVideo")}
      size={{ key: sizeKey, targetBytes: estimateVideoBytes(duration, bitrate, audio && hasAudio) }}
      disabled={busy}
      preview={
        <>
          <MotionExportPreview
            project={origin.project}
            page={page}
            staticDuration={animated ? undefined : staticDuration}
            services={services}
            selection={selection}
            centerSelection={props.centerSelection}
            framing={props.framing}
            paused={busy || props.previewActive === false}
            onReady={receive}
          />
          <div className="export-preview-caption">
            <strong>{page.name}</strong>
            <span>
              {output.width} × {output.height} px ·{" "}
              {t("duration", {
                seconds: duration.toFixed(2),
                rate: `${rate.numerator}/${rate.denominator}`,
              })}{" "}
              · sRGB
            </span>
          </div>
        </>
      }
      onSubmit={() => {
        const retiring = preview.current?.dispose();
        start(async ({ signal, progress, estimate, beforeFrame }) => {
          signal.throwIfAborted();
          if (!services.exportComposition) throw new Error(t("unavailable"));
          return services.exportComposition(
            {
              mode: "motion",
              centerSelection: props.centerSelection,
              compositionId: page.id,
              scale,
              framing: props.framing,
              container,
              frameRate: rate,
              staticDuration: animated ? undefined : staticDuration,
              videoBitrate: bitrate,
              audioBitrate: 192_000,
              audio: animated && audio,
              selection,
              signal,
              onProgress: progress,
              onSizeEstimate: estimate,
              background: true,
              beforeFrame: async () => {
                await retiring;
                await beforeFrame();
              },
            },
            {
              projectId: origin.project.id,
              compositionId: page.id,
              revision: origin.revision,
              page,
            },
          );
        });
      }}
    >
      <div className="export-field">
        <Label htmlFor="motion-export-container">{t("format")}</Label>
        <SelectField
          id="motion-export-container"
          label={t("format")}
          value={container}
          disabled={busy}
          options={[
            { value: "auto", label: t("automatic") },
            { value: "mp4", label: "MP4" },
            { value: "webm", label: "WebM" },
          ]}
          onValueChange={(value) => setContainer(value as typeof container)}
        />
      </div>
      <div className="export-field">
        <Label htmlFor="motion-export-scale">{t("resolution")}</Label>
        <SelectField
          id="motion-export-scale"
          label={t("resolution")}
          value={String(scale)}
          disabled={busy}
          options={[0.5, 1, 2, 3, 4].map((value) => ({ value: String(value), label: `${value}×` }))}
          onValueChange={(value) => setScale(Number(value))}
        />
      </div>
      {!animated && (
        <>
          <NumberInput
            label={t("staticDuration")}
            value={staticSeconds}
            min={0.1}
            max={3600}
            step={0.1}
            unit="s"
            disabled={busy}
            onCommit={setStaticSeconds}
          />
          <p className="muted-description">{t("staticVideoHint")}</p>
        </>
      )}
      {hasAudio && (
        <label className="switch-row">
          <span>{t("includeAudio")}</span>
          <Switch
            aria-label={t("includeAudio")}
            checked={audio}
            disabled={busy}
            onCheckedChange={setAudio}
          />
        </label>
      )}
      <ExportAdvanced>
        <div className="export-field">
          <Label htmlFor="motion-export-fps">{t("frameRate")}</Label>
          <SelectField
            id="motion-export-fps"
            label={t("frameRate")}
            value={fps}
            disabled={busy}
            options={[
              {
                value: "composition",
                label: animated
                  ? t("authoredRate", {
                      rate: baseRate.numerator / baseRate.denominator,
                    })
                  : "30 fps",
              },
              ...["24", "25", "30", "60", "24000/1001", "30000/1001", "60000/1001"].map(
                (value) => ({ value, label: `${value} fps` }),
              ),
            ]}
            onValueChange={setFps}
          />
        </div>
        <div className="export-field">
          <Label htmlFor="motion-export-quality">{t("bitrate")}</Label>
          <SelectField
            id="motion-export-quality"
            label={t("bitrate")}
            value={String(bitrate)}
            disabled={busy}
            options={[4, 8, 16].map((value) => ({
              value: String(value * 1_000_000),
              label: `${value} Mb/s`,
            }))}
            onValueChange={(value) => setBitrate(Number(value))}
          />
        </div>
      </ExportAdvanced>
    </ExportLayout>
  );
}
