import { useSyncExternalStore } from "react";
import { Film, Info, X } from "lucide-react";
import { Progress } from "radix-ui";
import { useTranslation } from "react-i18next";
import type { DepthPreparationController } from "../../../services/depth/controller";
import { useTargetPresentation } from "./use-target-presentation";
import { BackgroundStatus } from "./BackgroundStatus";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import "../../properties/effects/library-messages";
import "./object-options.css";
/** Same target card, working mascot, shimmer, bytes and completion state as background removal. */
export function DepthPreparationOptions({ port }: { port: DepthPreparationController }) {
  const { t, i18n } = useTranslation("depth-anythingFx");
  const state = useSyncExternalStore(port.subscribe, port.read, port.read);
  const model = useSyncExternalStore(
    port.client.model.subscribe,
    port.client.model.read,
    port.client.model.read,
  );
  const thumbnail = useTargetPresentation(port, state);
  if (!state) return null;
  const loading = model.phase === "loading" || model.phase === "initializing";
  const fraction = loading ? model.loaded / model.total : state.progress;
  const percent = Math.min(100, Math.floor(fraction * 100));
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  return (
    <section className="object-selection-options" aria-label={t("name")}>
      <div className="background-action-heading">
        <strong>{t("name")}</strong>
        <div className="background-action-buttons">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t("info")}>
                <Info size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="background-refine-hint">{t("hint")}</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size={state.busy ? "sm" : "icon-xs"}
            aria-label={t(state.busy ? "cancel" : "close")}
            onClick={port.reset}
          >
            {state.busy ? t("cancel") : <X size={14} />}
          </Button>
        </div>
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
          <BackgroundStatus
            state="loading"
            size={28}
            busy={state.busy}
            completed={state.completed}
            label={t(state.preparingSource ? "preview" : loading ? "downloading" : "processing")}
            completedLabel={t("completed")}
            step={loading || state.mediaKind === "video" ? `${number.format(percent)} %` : "3/3"}
          />
        </div>
      </div>
      {state.busy && loading && (
        <div className="background-download-bytes">
          <span>
            {number.format(model.loaded / 1_000_000)} / {number.format(model.total / 1_000_000)} MB
          </span>
          <span>{number.format(percent)} %</span>
        </div>
      )}
      {state.busy && (
        <Progress.Root
          className="background-action-progress"
          value={percent}
          aria-label={t(state.preparingSource ? "preview" : loading ? "downloading" : "processing")}
        >
          <Progress.Indicator style={{ transform: `translateX(-${100 - percent}%)` }} />
        </Progress.Root>
      )}
      {state.error && (
        <div className="object-selection-error" role="alert">
          <p>{state.error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              port.reset();
            }}
          >
            {t("close")}
          </Button>
        </div>
      )}
    </section>
  );
}
