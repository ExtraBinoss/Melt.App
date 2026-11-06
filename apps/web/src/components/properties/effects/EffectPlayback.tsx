import { useInputPreview } from "./effect-motion/use-input-preview";
import { useEffect, useId, useRef, useState, useMemo } from "react";
import { AnimationDetails } from "../../motion/animations/AnimationDetails";
import { effectMotionNavigation, useEffectMotionRequest } from "./effect-motion/navigation";
import { animationPresentation } from "../../motion/animations/presentation";
import { type DriverRange } from "./effect-motion/DriverRange";
import { Activity, Check, Circle, Play, SlidersHorizontal, Square, X } from "lucide-react";
import { useSetAtom } from "jotai";
import { timelineOpenAtom } from "../../../state/motion/timeline-state";
import { createMotionTransport } from "../../../services/motion/transport";
import { MotionChoices } from "./effect-motion/MotionChoices";
import { Popover, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { MotionSettings } from "./effect-motion/MotionSettings";
import type { Effect, EnginePort, MotionInputKind } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";

import {
  addEffectDriver,
  setEffectMotion,
  smoothAutomaticChannel,
  effectDriverChannel,
  interactiveEffectChannels,
  effectMotionProperties,
  motionPropertyKey,
} from "./effect-motion/authoring";
import { InputPad } from "./effect-motion/InputPad";
import "./effect-motion/messages";
import "./messages";
import "./effect-motion/style.css";

/** Controls create ordinary editable action blocks; a recording is one undo transaction. */
export function EffectPlayback({
  engine,
  effect,
  disabled,
  onChange,
  onStart,
  onCancel,
}: {
  engine: EnginePort;
  effect: Effect;
  disabled: boolean;
  onChange(this: void, patch: Partial<Effect>, preview?: boolean): void;
  onStart?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsAction, setSettingsAction] = useState<"automatic" | "interactive">(
    effect.motion?.interactive ? "interactive" : "automatic",
  );
  const settingsId = useId();
  const showTimeline = useSetAtom(timelineOpenAtom);
  const properties = useMemo(() => effectMotionProperties(engine, effect), [engine, effect]);
  const initialAction = effect.motion?.interactive ?? effect.motion?.automatic;
  const initialChannel = initialAction?.channels[0];
  const initialDriver = initialChannel?.driver;
  const initialProperty = properties.find(
    (property) =>
      property.target.property === initialChannel?.target.property &&
      property.target.kind.endsWith("Setting") ===
        (initialChannel?.target.kind === "effectSetting"),
  );
  const [period, setPeriod] = useState(() => {
    const driver = effect.motion?.automatic?.channels[0]?.driver;
    return driver && "period" in driver ? driver.period.value / driver.period.rate : 2;
  });
  const [response, setResponse] = useState(
    initialDriver && "response" in initialDriver && initialDriver.response
      ? initialDriver.response.damping < 1
        ? "rebound"
        : "smooth"
      : initialDriver && !("period" in initialDriver)
        ? "direct"
        : "smooth",
  );
  const [clickMode, setClickMode] = useState<string>(
    initialDriver && "clickMode" in initialDriver
      ? (initialDriver.clickMode ?? "impulse")
      : "impulse",
  );
  const [returnOnRelease, setReturnOnRelease] = useState(
    initialDriver && "returnOnRelease" in initialDriver
      ? (initialDriver.returnOnRelease ?? true)
      : true,
  );
  const [propertyKey, setPropertyKey] = useState(
    initialProperty ? motionPropertyKey(initialProperty) : "",
  );
  const [range, setRange] = useState<{ key: string; value: DriverRange } | null>(
    initialProperty && initialChannel
      ? {
          key: motionPropertyKey(initialProperty),
          value: [
            initialChannel.points[0]!.value,
            initialChannel.points[
              initialChannel.driver?.kind === "loop" ? 1 : initialChannel.points.length - 1
            ]!.value,
          ],
        }
      : null,
  );
  const [secondaryKey, setSecondaryKey] = useState("");
  const [input, setInput] = useState<MotionInputKind>(
    initialDriver && !("period" in initialDriver) ? initialDriver.kind : "pointerX",
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState<"saved" | "failed" | "full" | "">("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [propertyOwner, setPropertyOwner] = useState(effect.id);
  if (propertyOwner !== effect.id) {
    setPropertyOwner(effect.id);
    setPropertyKey("");
    setSecondaryKey("");
    setRange(null);
    setOpen(false);
    setSettingsOpen(false);
  }
  const property =
    properties.find((property) => motionPropertyKey(property) === propertyKey) ?? properties[0];
  const defaultChannel = property
    ? effectDriverChannel(property, { kind: "loop", period: { value: 2, rate: 1 } })
    : null;
  const outputRange: DriverRange =
    property && range?.key === motionPropertyKey(property)
      ? range.value
      : [defaultChannel?.points[0]?.value ?? 0, defaultChannel?.points.at(-1)?.value ?? 1];
  const secondary =
    properties.find((item) => motionPropertyKey(item) === secondaryKey && item !== property) ??
    properties.find((item) => item !== property && item.target.property.endsWith("Y")) ??
    properties.find((item) => item !== property);
  const { record, emit, finish, output, recording, testing } = useInputPreview({
    engine,
    effect,
    secondary,
    input,
    response,
    clickMode,
    returnOnRelease,
    outputRange,
    setInput,
    setStatus,
    showTimeline,
    onChange,
    onStart,
    onCancel,
  });
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId);

  useEffect(() => {
    const store = animationPresentation(engine);
    const reveal = () => {
      const request = store.readEditorRequest();
      if (
        request?.owner.kind !== "compositionEffect" ||
        request.owner.effectId !== effect.id ||
        disabled ||
        !trigger.current?.isConnected ||
        trigger.current.closest('[data-slot="popover-content"][data-state="closed"]')
      )
        return;
      setOpen(true);
    };
    const stop = store.subscribeEditor(reveal);
    reveal();
    return stop;
  }, [engine, effect.id, disabled]);

  useEffect(() => {
    const pointer = (event: PointerEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !(event.target as Element).closest?.("[data-effect-input-surface]")
      )
        finish.current?.(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && finish.current) {
        event.preventDefault();
        event.stopPropagation();
        finish.current(false);
      }
    };
    const cancel = () => finish.current?.(false);
    const hide = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hide);
      cancel();
    };
  }, [engine, effect.id, finish]);

  function add(kind: "loop" | "pingPong" | "pulse") {
    if (!property) return;
    setSettingsAction("automatic");
    finish.current?.(false);
    try {
      const current = effect.motion ?? {};
      const automatic =
        current.automatic?.channels[0]?.driver?.kind === kind
          ? undefined
          : {
              name: t(`effectMotion:${kind}`),
              channels: [
                smoothAutomaticChannel(
                  effectDriverChannel(
                    property,
                    { kind, period: { value: Math.round(period * 1000), rate: 1000 } },
                    outputRange,
                  ),
                ),
              ],
            };
      setEffectMotion(engine, effect.id, { ...current, automatic });
      if (automatic) createMotionTransport(engine).play();
      setStatus("");
    } catch {
      setStatus("failed");
    }
  }

  const selectedAnimation =
    page?.motion?.tracks
      .flatMap((track) => track.animations ?? [])
      .find((animation) => animation.id === editing) ??
    page?.motion?.sceneAnimations?.find((animation) => animation.id === editing);
  useEffectMotionRequest(engine, effect.id, (request) => {
    if (request.pageId !== page?.id) return;
    if (
      request.layersOnly &&
      !trigger.current?.closest("[data-attachment-body], .composition-effect-popover")
    )
      return;
    if (trigger.current?.closest('[data-slot="popover-content"][data-state="closed"]')) return;
    if (request.action) loadAction(request.action);
    setOpen(true);
    setEditing(request.animationId ?? null);
    setSettingsOpen(Boolean(request.action));
    effectMotionNavigation(engine).clear();
  });

  function loadAction(actionKey: "automatic" | "interactive") {
    setSettingsAction(actionKey);
    const action = effect.motion?.[actionKey];
    const channel = action?.channels[0],
      driver = channel?.driver;
    if (channel && driver) {
      const property = properties.find(
        (property) =>
          property.target.property === channel.target.property &&
          property.target.kind.endsWith("Setting") === (channel.target.kind === "effectSetting"),
      );
      if (property) {
        setPropertyKey(motionPropertyKey(property));
        setRange({
          key: motionPropertyKey(property),
          value: [
            channel.points[0]!.value,
            channel.points[driver.kind === "loop" ? 1 : channel.points.length - 1]!.value,
          ],
        });
      }
      if ("period" in driver) setPeriod(driver.period.value / driver.period.rate);
      else {
        setInput(driver.kind);
        setResponse(
          !driver.response ? "direct" : driver.response.damping < 1 ? "rebound" : "smooth",
        );
        setReturnOnRelease(driver.returnOnRelease ?? true);
        setClickMode(driver.clickMode ?? "impulse");
      }
    }
  }

  function chooseInput(kind: MotionInputKind) {
    if (!property) return;
    setSettingsAction("interactive");
    finish.current?.(false);
    const previous = effect.motion?.interactive?.channels[0]?.driver?.kind;
    if (previous === kind) {
      const { interactive: _interactive, ...remaining } = effect.motion ?? {};
      setEffectMotion(engine, effect.id, remaining);
      return;
    }
    const channels = interactiveEffectChannels(
      property,
      kind,
      { response, clickMode, returnOnRelease, range: outputRange },
      secondary,
    );
    try {
      setEffectMotion(engine, effect.id, {
        ...effect.motion,
        interactive: { name: t(`effectMotion:${kind}`), channels },
      });
      record(property, kind);
    } catch {
      setStatus("failed");
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) finish.current?.(false);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button ref={trigger} size="sm" variant="secondary" disabled={disabled}>
          <Activity size={13} aria-hidden />
          {t("effectMotion:title")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={root}
        className="effect-motion"
        onOpenAutoFocus={() => {
          const store = animationPresentation(engine);
          const request = store.readEditorRequest();
          if (request?.owner.kind === "compositionEffect" && request.owner.effectId === effect.id)
            store.consumeEditorRequest(request);
        }}
        align="start"
        data-keybinding-capture
        onInteractOutside={(event) => {
          if (
            (recording || testing) &&
            event.target instanceof Element &&
            event.target.closest("[data-effect-input-surface]")
          )
            event.preventDefault();
        }}
      >
        {selectedAnimation ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              {t("effectMotion:title")}
            </Button>

            <fieldset disabled={disabled}>
              <legend>{selectedAnimation.preset.name}</legend>
              <AnimationDetails
                engine={engine}
                animation={selectedAnimation}
                run={(action) => {
                  try {
                    action();
                  } catch {
                    setStatus("failed");
                  }
                }}
              />
            </fieldset>
          </>
        ) : property ? (
          <>
            <MotionChoices
              disabled={disabled}
              recording={recording}
              activeAutomatic={effect.motion?.automatic?.channels[0]?.driver?.kind}
              activeInteractive={effect.motion?.interactive?.channels[0]?.driver?.kind}
              onAutomatic={add}
              onInput={chooseInput}
            />
            {!recording && (
              <div className="effect-motion-record-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled || !effect.motion?.interactive}
                  onClick={() =>
                    testing
                      ? finish.current?.(false)
                      : property &&
                        record(
                          property,
                          effect.motion?.interactive?.channels[0]?.driver?.kind as MotionInputKind,
                        )
                  }
                >
                  <Play size={12} />
                  {t(testing ? "effectMotion:stopTest" : "effectMotion:test")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={t("effectMotion:record")}
                  disabled={disabled || (!effect.motion?.automatic && !effect.motion?.interactive)}
                  onClick={() => {
                    if (effect.motion?.interactive && property)
                      record(
                        property,
                        effect.motion.interactive.channels[0]!.driver!.kind as MotionInputKind,
                        true,
                      );
                    else if (effect.motion?.automatic) {
                      try {
                        finish.current?.(false);
                        addEffectDriver(
                          engine,
                          effect,
                          effect.motion.automatic.channels,
                          effect.motion.automatic.name,
                          period * 1000,
                          true,
                        );
                        showTimeline(true);
                        createMotionTransport(engine).play();
                        setStatus("saved");
                      } catch {
                        setStatus("failed");
                      }
                    }
                  }}
                >
                  <Circle size={12} />
                  {t("effectMotion:recordAction")}
                </Button>
              </div>
            )}
            {(recording || testing) && (
              <div className="effect-motion-recording">
                <div className="effect-motion-recording-heading">
                  {recording && <span className="effect-motion-record-dot" />}
                  <output ref={output} aria-live="off">
                    {t(recording ? "effectMotion:recording" : "effectMotion:testing")}
                  </output>
                </div>
                <InputPad kind={input} emit={emit} cancel={() => finish.current?.(false)} />
                {recording && (
                  <div className="effect-motion-record-actions">
                    <Button size="sm" onClick={() => finish.current?.()}>
                      <Square size={13} aria-hidden />
                      {t("effectMotion:done")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => finish.current?.(false)}>
                      <X size={14} aria-hidden />
                      {t("effectMotion:cancel")}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="effect-motion-settings">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={recording}
                aria-expanded={settingsOpen}
                aria-controls={settingsId}
                onClick={() => setSettingsOpen((value) => !value)}
              >
                <SlidersHorizontal size={14} aria-hidden />
                {t("effectMotion:settings")}
              </Button>
              {settingsOpen && (
                <div id={settingsId} className="effect-motion-settings-fields">
                  {effect.motion?.automatic && effect.motion.interactive && (
                    <div className="effect-motion-record-actions">
                      {(["automatic", "interactive"] as const).map((action) => (
                        <Button
                          key={action}
                          size="sm"
                          variant="ghost"
                          aria-pressed={settingsAction === action}
                          onClick={() => loadAction(action)}
                        >
                          {t(`effectMotion:${action}`)}
                        </Button>
                      ))}
                    </div>
                  )}
                  <MotionSettings
                    effect={effect}
                    property={property}
                    properties={properties}
                    secondary={secondary}
                    outputRange={outputRange}
                    period={period}
                    input={input}
                    response={response}
                    clickMode={clickMode}
                    returnOnRelease={returnOnRelease}
                    disabled={disabled || recording}
                    setPropertyKey={setPropertyKey}
                    setRange={setRange}
                    setPeriod={setPeriod}
                    setInput={setInput}
                    setSecondaryKey={setSecondaryKey}
                    setResponse={setResponse}
                    setClickMode={setClickMode}
                    setReturnOnRelease={setReturnOnRelease}
                  />
                  {(effect.motion?.automatic || effect.motion?.interactive) && (
                    <Button
                      size="sm"
                      disabled={disabled || recording}
                      onClick={() => {
                        finish.current?.(false);
                        const motion = structuredClone(effect.motion!);
                        if (motion.automatic && settingsAction === "automatic") {
                          const driver = motion.automatic.channels[0]!.driver!;
                          if ("period" in driver)
                            motion.automatic.channels = [
                              smoothAutomaticChannel(
                                effectDriverChannel(
                                  property,
                                  {
                                    ...driver,
                                    period: { value: Math.round(period * 1000), rate: 1000 },
                                  },
                                  outputRange,
                                ),
                              ),
                            ];
                        }
                        if (motion.interactive && settingsAction === "interactive") {
                          motion.interactive = {
                            name: t(`effectMotion:${input}`),
                            channels: interactiveEffectChannels(
                              property,
                              input,
                              { response, clickMode, returnOnRelease, range: outputRange },
                              secondary,
                            ),
                          };
                        }
                        try {
                          setEffectMotion(engine, effect.id, motion);
                          setStatus("");
                        } catch {
                          setStatus("failed");
                        }
                      }}
                    >
                      {t("effectMotion:apply")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <p>{t("effectMotion:unavailable")}</p>
        )}
        {status && (
          <p role={status === "failed" || status === "full" ? "alert" : "status"}>
            {status === "saved" && <Check size={13} aria-hidden />}
            {t(`effectMotion:${status}`)}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
