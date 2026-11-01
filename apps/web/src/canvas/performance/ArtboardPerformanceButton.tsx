import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { EnginePort } from "@musart/core";
import { Activity, LoaderCircle, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { CopyButton } from "../../components/ui/copy-button";
import { InfoTooltip } from "../../components/shared/InfoTooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { ScrollShadow } from "../../components/shared/scroll/ScrollShadow";
import {
  CompositionPerformanceError,
  getCompositionPerformance,
} from "../../state/session/composition-performance";
import { PerformanceEnvironment } from "./PerformanceEnvironment";
import { PerformanceMeasurements } from "./PerformanceMeasurements";
import "./messages";
import "./performance.css";

/** Mounted only while open: hovering a footer never starts a profiling loop. */
function PerformancePanel({
  engine,
  compositionId,
  onDismiss,
}: {
  engine: EnginePort;
  compositionId: string;
  onDismiss(this: void): void;
}) {
  const { t, i18n } = useTranslation("compositionPerformance");
  const port = useMemo(() => getCompositionPerformance(engine), [engine]);
  const snapshot = useSyncExternalStore(
    port.subscribe,
    () => port.read(compositionId),
    () => null,
  );
  const [target, setTarget] = useState(60);
  const [request, setRequest] = useState(0);
  const [status, setStatus] = useState("loading");
  const budgetMs = 1000 / target;
  const budget = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(
    budgetMs,
  );
  useEffect(() => {
    const controller = new AbortController();
    void port.request(compositionId, controller.signal).then(
      () => {
        if (!controller.signal.aborted) setStatus("ready");
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setStatus(error instanceof CompositionPerformanceError ? error.code : "failed");
      },
    );
    const interrupt = (event: Event) => {
      const outside = !(event.target as Element)?.closest?.(
        ".composition-performance-popover,[data-performance-control]",
      );
      if (
        event instanceof KeyboardEvent &&
        event.key === "Escape" &&
        (event.target as Element)?.closest?.("[data-performance-control]")
      )
        return;
      const typing = (event.target as Element)?.closest?.("input,textarea,[contenteditable=true]");
      const command =
        event instanceof KeyboardEvent &&
        (event.key === "Escape" || (!typing && (event.ctrlKey || event.metaKey)));
      if (outside || command) {
        controller.abort();
        onDismiss();
      }
    };
    document.addEventListener("pointerdown", interrupt, true);
    document.addEventListener("wheel", interrupt, { capture: true, passive: true });
    document.addEventListener("keydown", interrupt, true);
    return () => {
      document.removeEventListener("pointerdown", interrupt, true);
      document.removeEventListener("wheel", interrupt, true);
      document.removeEventListener("keydown", interrupt, true);
      controller.abort();
    };
  }, [port, compositionId, request, onDismiss]);
  const loading = status === "loading";
  const report = useMemo(
    () => (snapshot ? JSON.stringify({ ...snapshot, budgetMs, targetFps: target }, null, 2) : ""),
    [snapshot, budgetMs, target],
  );
  return (
    <>
      <header className="composition-performance-header">
        <div>
          <div className="composition-performance-heading">
            <h2>{t("title")}</h2>
            <InfoTooltip label={t("description")}>
              <div className="space-y-2">
                <p>{t("timingNote")}</p>
                <p>{t("warmthNote")}</p>
                <p>{t("sharedNote")}</p>
              </div>
            </InfoTooltip>
          </div>
        </div>
        <div className="composition-performance-actions">
          <CopyButton
            text={report}
            label={t("copyReport")}
            disabled={loading || status !== "ready" || !snapshot}
          />
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            disabled={loading}
            aria-label={t("refresh")}
            onClick={() => {
              setStatus("loading");
              setRequest((value) => value + 1);
            }}
          >
            {loading ? <LoaderCircle className="composition-performance-spinner" /> : <RotateCw />}
          </Button>
        </div>
      </header>
      <div className="composition-performance-budget">
        <span>{t("frameBudget")}</span>
        <strong>{t("milliseconds", { value: budget })}</strong>
        <Select value={String(target)} onValueChange={(value) => setTarget(Number(value))}>
          <SelectTrigger className="composition-performance-target-select" aria-label={t("target")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            data-performance-control
            data-canvas-control
            data-keybinding-capture
            className="composition-performance-target-options"
          >
            {[24, 30, 60, 90, 120, 144, 165, 240, 360].map((fps) => (
              <SelectItem key={fps} value={String(fps)}>
                {t("fps", { count: fps })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ScrollShadow className="composition-performance-scroll">
        <div className="composition-performance-viewport" aria-busy={loading}>
          {loading && (
            <p className="composition-performance-status" role="status">
              {t("loading")}
            </p>
          )}
          {!loading && status !== "ready" && (
            <p className="composition-performance-error" role="alert">
              {t(`errors.${status}`)}
            </p>
          )}
          {status === "ready" && snapshot && (
            <>
              <PerformanceMeasurements snapshot={snapshot} budgetMs={budgetMs} />
              {snapshot.environment && (
                <PerformanceEnvironment environment={snapshot.environment} />
              )}
            </>
          )}
          {!loading && status === "ready" && !snapshot && (
            <p className="composition-performance-status" role="status">
              {t("errors.stale")}
            </p>
          )}
        </div>
      </ScrollShadow>
      <footer className="composition-performance-footer">
        {status === "ready" && snapshot ? (
          <>
            <span>{t("sampleCount", { count: snapshot.sampleCount })}</span>
            <time dateTime={new Date(snapshot.measuredAt).toISOString()}>
              {t("measuredAt", {
                time: new Intl.DateTimeFormat(i18n.language, {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(snapshot.measuredAt),
              })}
            </time>
          </>
        ) : (
          <span>{t("onDemand")}</span>
        )}
      </footer>
    </>
  );
}

/** Position and artboard activation are owned by the artboard footer host. */
export function ArtboardPerformanceButton({
  engine,
  compositionId,
}: {
  engine: EnginePort;
  compositionId: string;
}) {
  const { t } = useTranslation("compositionPerformance");
  const [open, setOpen] = useState(false);
  const dismiss = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const wheel = (event: WheelEvent) => {
      if (
        !(event.target as Element)?.closest?.(
          ".composition-performance-popover,[data-performance-control]",
        )
      )
        setOpen(false);
    };
    const hidden = () => {
      if (document.hidden) setOpen(false);
    };
    document.addEventListener("wheel", wheel, { capture: true, passive: true });
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("wheel", wheel, true);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [open]);
  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="artboard-performance-button"
                data-canvas-control
                aria-label={t("title")}
              >
                <Activity aria-hidden="true" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("title")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open && (
        <PopoverContent
          className="composition-performance-popover"
          side="top"
          align="start"
          sideOffset={10}
          aria-label={t("title")}
          data-canvas-control
          data-keybinding-capture
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.target as HTMLElement).focus({ preventScroll: true });
          }}
        >
          <PerformancePanel
            key={compositionId}
            engine={engine}
            compositionId={compositionId}
            onDismiss={dismiss}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}
