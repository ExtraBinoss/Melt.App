import { useSyncExternalStore, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Blend, Undo2, X, Check } from "lucide-react";
import { createLayerGeometryIndex, type EnginePort } from "@musart/core";
import type { ObjectSelectionPort } from "../../../services/selection/object/model";
import { Button } from "../../ui/button";
import { Throbber } from "../../ui/throbber/Throbber";
import "../../../services/selection/wand/messages";
import "./object-options.css";
import { ObjectSelectionGuide } from "./ObjectSelectionGuide";
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
    [error, setError] = useState("");
  const page = snapshot?.project.pages.find((item) => item.id === snapshot.pageId);
  const geometry = page ? createLayerGeometryIndex(page) : undefined;
  const selected =
    snapshot?.selection.length === 1 ? geometry?.byId.get(snapshot.selection[0]!) : undefined;
  const target =
    selected?.kind === "image" &&
    !selected.spatial &&
    geometry?.isVisible(selected.id) &&
    !geometry.isLocked(selected.id)
      ? selected.id
      : undefined;
  function run(action: () => Promise<void>) {
    setError("");
    void action().catch((failure: unknown) => {
      if (!(failure instanceof DOMException && failure.name === "AbortError"))
        setError(failure instanceof Error ? failure.message : String(failure));
    });
  }
  return (
    <section className="object-selection-options" aria-label={t("objectTitle")}>
      <p>{target ? t("objectTarget") : t("translation:selectImageFirst")}</p>
      <Button
        disabled={!target || state?.busy || state?.applying}
        onClick={() => {
          if (target) run(() => port.background(target));
        }}
      >
        <Blend size={14} />
        {t("objectBackground")}
      </Button>
      <p>{t("objectBackgroundHint")}</p>
      <ObjectSelectionGuide />
      {state && !state.hovering && (
        <Button
          disabled={state.busy || state.applying || Boolean(state.error) || state.selected === 0}
          onClick={() => run(() => port.apply())}
        >
          <Check size={14} />
          {t("objectApply")}
        </Button>
      )}
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
      {state && (
        <div className="object-selection-actions">
          <Button
            variant="outline"
            size="sm"
            disabled={state.busy || state.applying}
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
            <X size={14} />
            {t("translation:cancel")}
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
