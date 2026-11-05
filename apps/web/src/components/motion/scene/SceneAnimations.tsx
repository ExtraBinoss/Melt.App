import { useEffect, useState } from "react";
import { ChevronRight, Plus, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  extractSceneMotionAnimationPreset,
  motionTimeToSeconds,
  projectSceneMotionAnimations,
  sceneAnimationOwner,
  sceneAnimationOwnerKey,
  type Composition,
  type EnginePort,
  type SceneAnimationOwner,
  type SceneMotionAnimation,
} from "@musart/core";
import { AnimatedCollapsibleContent } from "../../shared/disclosure/AnimatedCollapsibleContent";
import { NumberInput } from "../../shared/NumberInput";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { Collapsible, CollapsibleTrigger } from "../../ui/collapsible";
import { createMotionTransport } from "../../../services/motion/transport";
import { AnimationDetailsDisclosure } from "../animations/AnimationDetails";
import { AnimationActions } from "../animations/AnimationActions";
import { SavePreset } from "../animations/SavePreset";
import { animationPresentation, useAnimationPresentation } from "../animations/presentation";
import { animationPresetName } from "../../spatial/presentation";
import { SceneMotionPopover } from "./SceneMotionPopover";
import "../animations/messages";
import "../animations/animations.css";

/** Camera, environment and lights share the same authoritative action editor. */
export function SceneAnimations({
  engine,
  page,
  owner,
}: {
  engine: EnginePort;
  page: Composition;
  owner: SceneAnimationOwner;
}) {
  const { t } = useTranslation("animations");
  const presentation = useAnimationPresentation(engine);
  const [error, setError] = useState(false);
  const [details, setDetails] = useState(true);
  useEffect(
    () =>
      animationPresentation(engine).subscribeEditor((animationId) => {
        if (
          projectSceneMotionAnimations(page, owner).some(
            (animation) => animation.id === animationId,
          )
        )
          setDetails(true);
      }),
    [engine, page, owner],
  );
  if (page.motion?.mode !== "motion") return null;
  const animations = projectSceneMotionAnimations(page, owner);
  function run(action: () => void) {
    const snapshot = engine.getSnapshot();
    if (
      snapshot.pageId !== page.id ||
      snapshot.project.pages.find((item) => item.id === page.id) !== page
    )
      return;
    try {
      action();
      setError(false);
    } catch {
      setError(true);
    }
  }
  function update(
    animation: SceneMotionAnimation,
    patch: Partial<Pick<SceneMotionAnimation, "start" | "duration" | "strength" | "enabled">>,
  ) {
    run(() => engine.execute({ type: "updateMotionAnimation", animationId: animation.id, patch }));
  }
  return (
    <section
      className="layer-animations"
      aria-label={t("title")}
      data-scene-animations={owner.kind}
    >
      <div className="section-title">
        <h3>
          <Sparkles size={13} />
          {t("title")}
        </h3>
        <SceneMotionPopover
          engine={engine}
          owner={owner}
          transport={createMotionTransport(engine)}
          trigger={
            <Button variant="ghost" size="icon-xs" aria-label={t("add")}>
              <Plus size={14} />
            </Button>
          }
        />
      </div>
      {animations.map((animation) => {
        const selected = presentation.selected === animation.id;
        return (
          <Collapsible
            className="animation-instance"
            key={animation.id}
            data-selected={selected}
            open={selected}
            onOpenChange={(open) =>
              animationPresentation(engine).set({ selected: open ? animation.id : null })
            }
          >
            <div className="animation-instance-header">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="animation-disclosure-trigger"
                  aria-label={`${t("details")} · ${animationPresetName(animation.preset, t)}`}
                >
                  <ChevronRight size={12} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleTrigger asChild>
                <button className="animation-instance-name">
                  {animationPresetName(animation.preset, t)}
                </button>
              </CollapsibleTrigger>
              <Switch
                aria-label={t("enabled")}
                checked={animation.enabled}
                onCheckedChange={(enabled) => update(animation, { enabled })}
              />
            </div>
            <AnimatedCollapsibleContent open={selected} className="animation-disclosure">
              <div className="animation-instance-body">
                <div className="animation-instance-fields">
                  <NumberInput
                    identity={animation}
                    label={t("start")}
                    value={motionTimeToSeconds(animation.start) * 1000}
                    min={0}
                    max={3600000}
                    unit="ms"
                    onCommit={(value) =>
                      update(animation, { start: { value: Math.round(value), rate: 1000 } })
                    }
                  />
                  <NumberInput
                    identity={animation}
                    label={t("duration")}
                    value={motionTimeToSeconds(animation.duration) * 1000}
                    min={1}
                    max={3600000}
                    unit="ms"
                    onCommit={(value) =>
                      update(animation, { duration: { value: Math.round(value), rate: 1000 } })
                    }
                  />
                  <NumberInput
                    identity={animation}
                    label={t("intensity")}
                    value={animation.strength * 100}
                    min={0}
                    max={1000}
                    unit="%"
                    onCommit={(value) => update(animation, { strength: value / 100 })}
                  />
                </div>
                <AnimationDetailsDisclosure
                  engine={engine}
                  animation={animation}
                  run={run}
                  disabled={false}
                  open={details}
                  onOpenChange={setDetails}
                  actions={
                    <AnimationActions
                      engine={engine}
                      page={page}
                      animation={animation}
                      run={run}
                      disabled={false}
                    />
                  }
                />
              </div>
            </AnimatedCollapsibleContent>
          </Collapsible>
        );
      })}
      {page.motion.sceneProperties?.some(
        (property) =>
          sceneAnimationOwnerKey(sceneAnimationOwner(property.target)) ===
            sceneAnimationOwnerKey(owner) && property.keyframes.length >= 2,
      ) && (
        <SavePreset
          label={t("saveTimeline")}
          create={(name, id) => extractSceneMotionAnimationPreset(page, owner, name, id)}
        />
      )}
      {error && <p role="alert">{t("applyFailed")}</p>}
    </section>
  );
}
