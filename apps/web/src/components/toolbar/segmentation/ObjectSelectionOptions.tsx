import { useTargetPresentation } from "./use-target-presentation";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Info, Undo2, X, Film } from "lucide-react";
import { Progress } from "radix-ui";
import type { ObjectSelectionPort } from "../../../services/selection/object/model";
import type { LocalModelPort } from "../../../services/selection/model/contract";
import type { TaskRunner } from "../../projects/ProjectDialog";
import { Button } from "../../ui/button";
import { BackgroundStatus } from "./BackgroundStatus";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import "../../../services/selection/wand/messages";
import "./messages";
import "./object-options.css";
const emptySubscribe = () => () => {},
  emptyRead = () => null;
export function ObjectSelectionOptions({
  port,
  model,
  onTask,
  refining,
  onRefine,
  onClose,
}: {
  port: ObjectSelectionPort;
  model?: LocalModelPort;
  onTask: TaskRunner;
  refining: boolean;
  onRefine: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("pixelSelection");
  const state = useSyncExternalStore(port.subscribe, port.read, emptyRead);
  const status = useSyncExternalStore(
    model?.subscribe ?? emptySubscribe,
    model?.read ?? emptyRead,
    emptyRead,
  );
  const thumbnail = useTargetPresentation(port, state);
  if (!state) return null;
  const loading = status?.phase === "loading" || status?.phase === "idle",
    initializing = status?.phase === "initializing";
  const percent = status ? Math.min(100, Math.floor((100 * status.loaded) / status.total)) : 0;
  const label = state.preparingSource
    ? t("preparingVideo")
    : loading
      ? t("localModel:downloading")
      : initializing
        ? t("localModel:initializing")
        : t(
            state.mediaKind === "video"
              ? "removingPeople"
              : state.automatic
                ? "removingBackground"
                : "working",
          );
  const videoPercent = state.videoProgress
    ? Math.min(100, Math.floor((100 * state.videoProgress.completed) / state.videoProgress.total))
    : undefined;
  function run(action: () => Promise<void>) {
    void onTask(async () => {
      try {
        await action();
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
      }
    });
  }
  const stage = loading ? 1 : initializing ? 2 : 3;
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const mb = (bytes: number) =>
    t("localModel:megabytes", { value: number.format(bytes / 1_000_000) });
  return (
    <section className="object-selection-options" aria-label={t("objectTitle")}>
      <div className="background-action-heading">
        <strong>{t("translation:segment")}</strong>
        {state.busy ? (
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("translation:cancel")}
          </Button>
        ) : (
          <Button size="icon-xs" variant="ghost" aria-label={t("objectCancel")} onClick={onClose}>
            <X size={14} />
          </Button>
        )}
      </div>
      <div className="background-action-row">
        {state.thumbnail ? (
          <img
            ref={thumbnail}
            className="background-target-thumbnail"
            src={state.thumbnail}
            alt=""
            decoding="async"
          />
        ) : (
          <span className="background-target-thumbnail background-target-placeholder" aria-hidden>
            <Film size={20} />
          </span>
        )}
        <div className="background-target-status">
          <span className="background-target-name">{state.targetName}</span>
          {(state.busy || (state.completed && !state.error)) && (
            <BackgroundStatus
              busy={state.busy}
              completed={Boolean(state.completed && !state.error)}
              label={label}
              completedLabel={t("backgroundDone")}
              step={
                videoPercent !== undefined
                  ? `${number.format(videoPercent)} %`
                  : `${number.format(stage)}/${number.format(3)}`
              }
            />
          )}
        </div>
      </div>
      <div className="background-action-buttons">
        {state.completed && state.mediaKind !== "video" && !state.error && (
          <Button size="sm" variant="secondary" onClick={onRefine}>
            {t("refineBackground")}
          </Button>
        )}
        {refining && !state.completed && !state.busy && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-xs" variant="ghost" aria-label={t("objectRefineTitle")}>
                  <Info size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="background-refine-hint">
                {t("refineGestureHint")}
              </TooltipContent>
            </Tooltip>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={t("objectRemove")}
              disabled={state.applying}
              onClick={() => run(() => port.removeLast())}
            >
              <Undo2 size={14} />
            </Button>
            <Button
              size="sm"
              disabled={state.applying || Boolean(state.error) || !state.selected}
              onClick={() =>
                run(async () => {
                  await port.apply();
                  onClose();
                })
              }
            >
              <Check size={14} />
              {t("objectApply")}
            </Button>
          </>
        )}
      </div>
      {state.busy && !state.preparingSource && loading && status && (
        <div className="background-download-bytes">
          <span>
            {mb(status.loaded)} / {mb(status.total)}
          </span>
          <span>{number.format(percent)} %</span>
        </div>
      )}
      {state.busy && !state.preparingSource && loading && status && (
        <Progress.Root
          className="background-action-progress"
          value={percent}
          aria-label={t("localModel:downloadProgress")}
        >
          <Progress.Indicator style={{ transform: `translateX(-${100 - percent}%)` }} />
        </Progress.Root>
      )}
      {state.error && (
        <div className="object-selection-error" role="alert">
          <p>{t("objectError")}</p>
          <details>
            <summary>{t("objectDetails")}</summary>
            <pre>{state.error}</pre>
          </details>
          <Button
            size="sm"
            variant="outline"
            onClick={() => run(() => navigator.clipboard.writeText(state!.error))}
          >
            <Copy size={14} />
            {t("objectCopy")}
          </Button>
        </div>
      )}
    </section>
  );
}
