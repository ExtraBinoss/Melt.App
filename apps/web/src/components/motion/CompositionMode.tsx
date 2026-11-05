import { useState, type ReactNode } from "react";
import { ModeIcon } from "./ModeIcon";
import { useTranslation } from "react-i18next";
import {
  planMotionInitialization,
  type EnginePort,
  type MotionInitializationPlan,
  type SessionSnapshot,
} from "@musart/core";
import { Button } from "../ui/button";
import { SegmentedTabs } from "../shared/segmented/SegmentedTabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import "./messages";
import "./timeline.css";
import { compositionModeState, type CompositionModeState } from "./composition-mode-state";

type ModeOwner =
  | { snapshot: SessionSnapshot; state?: never }
  | { state: CompositionModeState; snapshot?: never };

export function CompositionMode({
  engine,
  snapshot,
  state,
  onMotionEnabled,
  presentation = "segmented",
  buttonLabel,
  renderMotionButton,
}: {
  engine: EnginePort;
  onMotionEnabled?: () => void;
  presentation?: "segmented" | "button";
  buttonLabel?: string;
  /** A persistent entry reuses initialization, then activates the caller's Motion surface. */
  renderMotionButton?: (activate: () => void) => ReactNode;
} & ModeOwner) {
  const { t } = useTranslation("motion");
  const owner = state ?? compositionModeState(snapshot);
  const [pending, setPending] = useState<MotionInitializationPlan | null>(null);
  const [error, setError] = useState("");
  const current = owner.mode;
  function choose(value: string) {
    if (value !== "static" && value !== "motion") return;
    if (value === current) return;
    setError("");
    try {
      const live = engine.getSnapshot();
      if (live.pageId !== owner.pageId || live.project.id !== owner.projectId) {
        setError("changed");
        return;
      }
      const page = live.project.pages.find((item) => item.id === live.pageId)!;
      if (value === "motion" && !page.motion) {
        const plan = planMotionInitialization(live);
        if (plan.requiresConfirmation) {
          setPending(plan);
          return;
        }
        engine.execute({ type: "setCompositionMode", mode: "motion", plan });
      } else engine.execute({ type: "setCompositionMode", mode: value });
      if (value === "motion") onMotionEnabled?.();
    } catch {
      setError("failed");
    }
  }
  function accept() {
    if (!pending) return;
    try {
      engine.execute({
        type: "setCompositionMode",
        mode: "motion",
        plan: pending,
        confirmed: true,
      });
      setPending(null);
      setError("");
      onMotionEnabled?.();
    } catch {
      setPending(null);
      setError("changed");
    }
  }
  return (
    <div className="motion-mode" data-canvas-control data-keybinding-capture>
      {renderMotionButton ? (
        renderMotionButton(() => {
          if (current === "motion") onMotionEnabled?.();
          else choose("motion");
        })
      ) : presentation === "button" && current === "static" ? (
        <Button size="lg" className="motion-enable-button" onClick={() => choose("motion")}>
          <ModeIcon mode="motion" size={22} />
          {buttonLabel ?? t("motion")}
        </Button>
      ) : (
        <SegmentedTabs
          tooltips
          mode="choice"
          size="compact"
          value={current}
          label={t("mode")}
          onValueChange={choose}
          items={[
            {
              value: "static",
              label: t("static"),
              icon: <ModeIcon mode="static" size={18} data-mode-icon="static" />,
            },
            {
              value: "motion",
              label: t("motion"),
              icon: <ModeIcon mode="motion" size={18} data-mode-icon="motion" />,
            },
          ]}
        />
      )}
      {error && (
        <p className="motion-error" role="alert">
          {t(error)}
        </p>
      )}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent data-canvas-control data-keybinding-capture>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("enableTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("enableDescription", { count: pending?.layerIds.length ?? 0 })}
            </AlertDialogDescription>
            <p className="motion-confirm-hint">{t("groupCount")}</p>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("no")}</AlertDialogCancel>
            <AlertDialogAction onClick={accept}>{t("yes")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
