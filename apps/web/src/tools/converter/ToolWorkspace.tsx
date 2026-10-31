import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { formatUiError } from "../../state/i18n/errors/format";
import { ChevronDown, Download, Eye } from "lucide-react";
import { TooltipProvider } from "../../components/ui/tooltip";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import { ScrollShadow } from "../../components/shared/scroll/ScrollShadow";
import { SelectField } from "../../components/shared/SelectField";
import { NumberInput } from "../../components/shared/NumberInput";
import { EffectParameters } from "../../components/properties/effects/EffectParameters";
import type { Effect } from "@musart/core";
import type { ToolController } from "./controller";
import { createControllerSlot } from "./lifecycle";
import { ToolTransport } from "./Transport";
import type { ImageOutput, VideoOutput, WorkspaceProps } from "./types";

function ExportProgress({ controller }: { controller: ToolController }) {
  const { t } = useTranslation("tools");
  const value = useSyncExternalStore(
    controller.progress.subscribe,
    controller.progress.read,
    controller.progress.read,
  );
  return (
    <div className="tool-progress">
      <progress max={1} value={value} aria-label={t("exporting")} />
      <span>{t("progress", { percent: Math.round(value * 100) })}</span>
    </div>
  );
}
export function ToolWorkspace(props: WorkspaceProps) {
  const [slot] = useState(createControllerSlot);
  const controller = useSyncExternalStore(slot.subscribe, slot.read, slot.read);
  useEffect(() => slot.connect(props.host, props.onActivity), [slot, props.host, props.onActivity]);
  return controller ? (
    <ToolControls
      key={props.tool.media}
      controller={controller}
      file={props.file}
      tool={props.tool}
    />
  ) : null;
}
function ToolControls({
  file,
  tool,
  controller,
}: Pick<WorkspaceProps, "file" | "tool"> & { controller: ToolController }) {
  const { t } = useTranslation("tools");
  const state = useSyncExternalStore(controller.subscribe, controller.read, controller.read);
  const [advanced, setAdvanced] = useState(false),
    [format, setFormat] = useState<ImageOutput | VideoOutput>(
      tool.media === "image" ? "png" : "auto",
    );
  const change = useCallback(
    (patch: Partial<Effect>, preview?: boolean) => {
      if (preview) controller.preview(patch);
      else controller.commit(patch);
    },
    [controller],
  );
  useEffect(() => {
    controller.open(file, tool);
  }, [controller, file, tool]);
  const blocked = state.phase !== "ready";
  return (
    <TooltipProvider>
      <div className="tool-controls-top">
        <h2>{t("parameters")}</h2>
        <span className="tool-file-name" title={state.name}>
          {state.name}
        </span>
      </div>
      {state.error != null && (
        <div className="tool-error" role="alert">
          <strong>{t(state.phase === "error" ? "readError" : "error")}</strong>
          <p>
            {state.error instanceof Error &&
            ["fileTooLarge", "invalidFile"].includes(state.error.message)
              ? t(state.error.message)
              : formatUiError(state.error)}
          </p>
          <Button size="sm" variant="outline" onClick={() => controller.open(file, tool)}>
            {t("retry")}
          </Button>
        </div>
      )}
      {state.effect && (
        <>
          <ScrollShadow className="tool-control-scroll" fade="mask">
            <div className="tool-control-viewport">
              <EffectParameters
                effect={state.effect}
                parameterKeys={advanced ? undefined : tool.basic}
                onChange={change}
                onCancel={controller.cancelPreview}
                disabled={blocked}
              />
              <Button
                className="tool-advanced"
                variant="ghost"
                size="sm"
                aria-expanded={advanced}
                onClick={() => setAdvanced(!advanced)}
              >
                {t(advanced ? "basic" : "advanced")}
                <ChevronDown size={13} />
              </Button>
            </div>
          </ScrollShadow>
          <div className="tool-output-controls">
            <SelectField
              label={t("resolution")}
              value={String(state.edge)}
              disabled={blocked}
              onValueChange={(value) => controller.resize(Number(value))}
              options={[720, 1280, 1920].map((value) => ({
                value: String(value),
                label: `${value} px`,
              }))}
            />
            <p className="tool-output-size">
              {t("outputSize", { width: state.width, height: state.height })}
            </p>
            <Button
              className="tool-compare"
              variant="outline"
              size="sm"
              disabled={blocked}
              aria-pressed={state.comparing}
              onPointerDown={(event) => {
                if (event.button === 0) {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  controller.compare(true);
                }
              }}
              onPointerUp={() => controller.compare(false)}
              onPointerCancel={() => controller.compare(false)}
              onLostPointerCapture={() => controller.compare(false)}
              onBlur={() => controller.compare(false)}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  controller.compare(true);
                }
              }}
              onKeyUp={() => controller.compare(false)}
            >
              <Eye size={14} />
              {t("compare")}
            </Button>
          </div>
          {tool.media === "video" && (
            <div className="tool-video-controls">
              <ToolTransport controller={controller} disabled={blocked} />
              <div className="tool-clip-fields">
                <NumberInput
                  label={t("clipStart")}
                  value={state.clipStart}
                  min={0}
                  max={Math.max(0, state.sourceDuration - 0.001)}
                  unit="s"
                  disabled={blocked}
                  onCommit={(start) =>
                    controller.clip(start, Math.min(state.clipLength, state.sourceDuration - start))
                  }
                />
                <NumberInput
                  label={t("clipLength")}
                  value={state.clipLength}
                  min={Math.min(0.001, state.clipLength)}
                  max={Math.min(60, state.sourceDuration - state.clipStart)}
                  unit="s"
                  disabled={blocked}
                  onCommit={(length) => controller.clip(state.clipStart, length)}
                />
              </div>
              <p>
                {t("sourceDuration", { seconds: state.sourceDuration.toFixed(2) })} ·{" "}
                {t("clipHint")}
              </p>
              <label className="tool-audio">
                <span>{t("mute")}</span>
                <Switch
                  checked={state.keepAudio}
                  disabled={blocked || !state.hasAudio}
                  onCheckedChange={controller.audio}
                />
              </label>
              {state.hasAudio && <p>{t("silentPreview")}</p>}
            </div>
          )}
          <div className="tool-download-controls">
            <SelectField
              label={t("format")}
              value={format}
              disabled={blocked}
              options={
                tool.media === "image"
                  ? [
                      { value: "png", label: "PNG" },
                      { value: "jpeg", label: "JPEG" },
                      { value: "webp", label: "WebP" },
                    ]
                  : [
                      { value: "auto", label: t("auto") },
                      { value: "mp4", label: "MP4" },
                      { value: "webm", label: "WebM" },
                    ]
              }
              onValueChange={(next) => setFormat(next as ImageOutput | VideoOutput)}
            />
            {state.phase === "exporting" ? (
              <>
                <ExportProgress controller={controller} />
                <Button variant="outline" onClick={controller.cancelExport}>
                  {t("cancel")}
                </Button>
              </>
            ) : (
              <Button disabled={blocked} onClick={() => void controller.download(format)}>
                <Download size={15} />
                {t(tool.media === "image" ? "downloadImage" : "downloadVideo")}
              </Button>
            )}
          </div>
        </>
      )}
    </TooltipProvider>
  );
}
