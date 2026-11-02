import { useSyncExternalStore, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, RotateCcw, ScanSearch, Undo2, X } from "lucide-react";
import type { EnginePort } from "@musart/core";
import type { ObjectSelectionPort } from "../../../services/selection/object/model";
import { SelectField } from "../../shared/SelectField";
import { Button } from "../../ui/button";
import { Throbber } from "../../ui/throbber/Throbber";
import "../../../services/selection/wand/messages";
import "./object-options.css";
const emptySubscribe = () => () => {},
  emptyRead = () => null;
export function ObjectSelectionOptions({
  port,
  engine,
}: {
  port: ObjectSelectionPort;
  engine?: EnginePort;
}) {
  const { t } = useTranslation("pixelSelection"),
    state = useSyncExternalStore(port.subscribe, port.read, emptyRead),
    snapshot = useSyncExternalStore(
      engine?.subscribe ?? emptySubscribe,
      engine?.getSnapshot ?? emptyRead,
      emptyRead,
    ),
    mode = useSyncExternalStore(port.subscribe, port.mode, port.mode),
    [error, setError] = useState("");
  const target =
    state?.layerId ?? (snapshot?.selection.length === 1 ? snapshot.selection[0] : undefined);
  function run(action: () => Promise<void>) {
    setError("");
    void action().catch((failure: unknown) => {
      if (!(failure instanceof DOMException && failure.name === "AbortError"))
        setError(failure instanceof Error ? failure.message : String(failure));
    });
  }
  return (
    <section className="object-selection-options" aria-label={t("objectTitle")}>
      <SelectField
        label={t("objectMode")}
        value={mode}
        options={[
          { value: "points", label: t("objectPoints") },
          { value: "box", label: t("objectBox") },
        ]}
        onValueChange={(value) => port.setMode(value === "box" ? "box" : "points")}
      />
      <p>{t("objectHint")}</p>
      <Button
        variant="secondary"
        size="sm"
        disabled={!target || state?.busy}
        onClick={() => {
          if (target) run(() => port.scan(target));
        }}
      >
        <ScanSearch size={14} />
        {t("objectDetect")}
      </Button>
      <small>{t("objectDetectHint")}</small>
      {state?.busy && (
        <div className="object-selection-working" role="status">
          <Throbber
            delayMs={0}
            size={14}
            label={t(state.scanning ? "objectScanning" : "working")}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("objectCancel")}
            onClick={() => {
              port.reset();
              setError("");
            }}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      {Boolean(state?.candidates.length) && (
        <div
          className="object-selection-candidates"
          role="group"
          aria-label={t("objectCandidates")}
        >
          {state!.candidates.map((candidate, index) => (
            <Button
              key={`${candidate.x}:${candidate.y}`}
              variant="outline"
              size="sm"
              disabled={state?.busy}
              aria-pressed={
                state?.points[0]?.x === candidate.x && state?.points[0]?.y === candidate.y
              }
              onClick={() => run(() => port.candidate(index))}
            >
              {t("objectCandidate", { number: index + 1 })}
            </Button>
          ))}
        </div>
      )}
      {state && (
        <div className="object-selection-actions">
          <Button
            variant="outline"
            size="sm"
            disabled={state.busy}
            onClick={() => run(() => port.removeLast())}
          >
            <Undo2 size={14} />
            {t("objectRemove")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              port.reset();
              setError("");
            }}
          >
            <RotateCcw size={14} />
            {t("objectReset")}
          </Button>
        </div>
      )}
      {(error || state?.error) && (
        <div className="object-selection-error" role="alert">
          <p>{t("objectError")}</p>
          <details>
            <summary>{t("objectDetails")}</summary>
            <pre>{error || state?.error}</pre>
          </details>
          <Button
            variant="outline"
            size="sm"
            onClick={() => run(() => navigator.clipboard.writeText(error || state?.error || ""))}
          >
            <Copy size={14} />
            {t("objectCopy")}
          </Button>
        </div>
      )}
    </section>
  );
}
