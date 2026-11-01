import { useState, type ReactElement } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  canApplySceneMotionAnimationPreset,
  motionTimeToSeconds,
  projectSceneMotionAnimations,
  type EnginePort,
  type SceneAnimationOwner,
  type SceneMotionAnimationPreset,
  type SessionSnapshot,
} from "@musart/core";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { TimelineIconButton } from "../ControlButton";
import { PresetPicker } from "../animations/PresetPicker";
import { animationPresentation } from "../animations/presentation";
import type { TimelineTransport } from "../model";
import "../animations/messages";

/** Capture the real scene owner/revision; the shared catalogue binds recipes at application. */
export function SceneMotionPopover({
  engine,
  owner,
  transport,
  disabled,
  trigger,
}: {
  engine: EnginePort;
  owner: SceneAnimationOwner;
  transport: TimelineTransport;
  disabled?: boolean;
  trigger?: ReactElement;
}) {
  const { t } = useTranslation("animations");
  const [origin, setOrigin] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState("");
  const page = origin?.project.pages.find((page) => page.id === owner.compositionId);
  function apply(preset: SceneMotionAnimationPreset) {
    if (!origin || !page) return;
    const current = engine.getSnapshot();
    if (
      current.project !== origin.project ||
      current.revision !== origin.revision ||
      current.pageId !== owner.compositionId
    ) {
      setError("changed");
      return;
    }
    if (!page.motion || !canApplySceneMotionAnimationPreset(page, owner, preset)) {
      setError("applyFailed");
      return;
    }
    const end = motionTimeToSeconds(page.motion.duration);
    const duration = Math.min(preset.duration / 1000, end);
    const start = Math.max(0, Math.min(motionTimeToSeconds(transport.read().time), end - duration));
    try {
      engine.execute({
        type: "addMotionAnimation",
        owner,
        preset,
        start: { value: Math.round(start * 1000000), rate: 1000000 },
        duration: { value: Math.round(duration * 1000000), rate: 1000000 },
      });
      engine.select([]);
      const updated = engine
        .getSnapshot()
        .project.pages.find((page) => page.id === owner.compositionId)!;
      animationPresentation(engine).set({
        selected: projectSceneMotionAnimations(updated, owner).at(-1)?.id ?? null,
      });
      setOrigin(null);
    } catch {
      setError("applyFailed");
    }
  }
  return (
    <Popover
      open={!!origin && !disabled}
      onOpenChange={(open) => {
        setError("");
        if (!open) {
          setOrigin(null);
          return;
        }
        transport.pause();
        const snapshot = engine.getSnapshot();
        if (snapshot.pageId === owner.compositionId) setOrigin(snapshot);
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <TimelineIconButton label={t("add")} disabled={disabled}>
            <Plus size={13} />
          </TimelineIconButton>
        )}
      </PopoverTrigger>
      {origin && page && (
        <PopoverContent
          className="motion-animation-popover"
          side="top"
          align="start"
          collisionPadding={12}
          aria-label={t("add")}
          data-canvas-control
          data-keybinding-capture
        >
          <PresetPicker engine={engine} scene={{ page, owner }} apply={apply} />
          {error && <p role="alert">{t(error)}</p>}
        </PopoverContent>
      )}
    </Popover>
  );
}
