import { useEffect, useId, useRef, useState } from "react";
import { animationPresentation } from "../../motion/animations/presentation";
import { DriverRangeFields, type DriverRange } from "./effect-motion/DriverRange";
import { Activity, Check, SlidersHorizontal, Square, X } from "lucide-react";
import { useSetAtom } from "jotai";
import { timelineOpenAtom } from "../../../state/motion/timeline-state";
import { createMotionTransport } from "../../../services/motion/transport";
import { MotionChoices } from "./effect-motion/MotionChoices";
import { Popover, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { NumberInput } from "../../shared/NumberInput";
import type {
  Effect,
  EnginePort,
  MotionDriver,
  MotionInputEvent,
  MotionInputKind,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { SelectField } from "../../shared/SelectField";
import { startEffectPreview } from "../../../state/session/effect-preview";
import {
  addEffectDriver,
  effectDriverChannel,
  effectMotionProperties,
  effectPropertyLabel,
  motionPropertyKey,
  previewEffectDriver,
  type EffectDriverProperty,
} from "./effect-motion/authoring";
import { appendMotionInput } from "./effect-motion/input-recording";
import { InputPad, type EffectPadInput } from "./effect-motion/InputPad";
import { beginEffectInputSession } from "./effect-motion/input-session";
import "./effect-motion/messages";
import "./effect-motion/style.css";

const INPUTS: MotionInputKind[] = [
  "pointerX",
  "pointerY",
  "pointerXY",
  "pointerDrag",
  "primaryClick",
  "secondaryClick",
];

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
  const settingsId = useId();
  const showTimeline = useSetAtom(timelineOpenAtom);
  const [period, setPeriod] = useState(2);
  const [response, setResponse] = useState("smooth");
  const [clickMode, setClickMode] = useState("impulse");
  const [returnOnRelease, setReturnOnRelease] = useState(true);
  const [propertyKey, setPropertyKey] = useState("");
  const [range, setRange] = useState<{ key: string; value: DriverRange } | null>(null);
  const [secondaryKey, setSecondaryKey] = useState("");
  const [input, setInput] = useState<MotionInputKind>("pointerX");
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<"saved" | "failed" | "full" | "">("");
  const output = useRef<HTMLOutputElement>(null);
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
  const latest = useRef({ onChange, onStart, onCancel });
  latest.current = { onChange, onStart, onCancel };
  const finish = useRef<((commit?: boolean) => void) | null>(null);
  const retireInput = useRef<(() => void) | null>(null);
  const take = useRef<{ started: number; events: MotionInputEvent[] } | null>(null);
  const properties = effectMotionProperties(engine, effect);
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
    properties.find((item) => item !== property && /Y$/.test(item.target.property)) ??
    properties.find((item) => item !== property);
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
      finish.current?.(false);
    };
  }, [engine, effect.id]);

  function add(kind: "loop" | "pingPong" | "pulse") {
    if (!property) return;
    finish.current?.(false);
    try {
      addEffectDriver(
        engine,
        effect,
        effectDriverChannel(
          property,
          { kind, period: { value: Math.round(period * 1000), rate: 1000 } },
          outputRange,
        ),
        t(`effectMotion:${kind}`),
        period * 1000,
      );
      showTimeline(true);
      createMotionTransport(engine).play();
      setStatus("saved");
    } catch {
      setStatus("failed");
    }
  }

  function record(selected: EffectDriverProperty, selectedInput: MotionInputKind = input) {
    createMotionTransport(engine).pause();
    setInput(selectedInput);
    setStatus("");
    const events: MotionInputEvent[] = [];
    take.current = { started: performance.now(), events };
    const driver: MotionDriver = {
      kind: selectedInput,
      initial: selectedInput.endsWith("Click") ? 0 : 0.5,
      events,
      ...(response === "direct"
        ? {}
        : { response: { frequency: 16, damping: response === "rebound" ? 0.35 : 1 } }),
      ...(selectedInput === "pointerDrag" ? { returnOnRelease } : {}),
      ...(selectedInput.endsWith("Click")
        ? { clickMode: clickMode === "toggle" ? "toggle" : "impulse" }
        : {}),
    };
    const neutral =
      selectedInput === "pointerDrag" &&
      typeof selected.value === "number" &&
      typeof outputRange[0] === "number" &&
      typeof outputRange[1] === "number" &&
      outputRange[0] !== outputRange[1]
        ? Math.max(
            0,
            Math.min(1, (selected.value - outputRange[0]) / (outputRange[1] - outputRange[0])),
          )
        : driver.initial;
    const channel = effectDriverChannel(
      selected,
      { ...driver, initial: neutral, ...(selectedInput === "pointerXY" ? { axis: "x" } : {}) },
      outputRange,
    );
    const secondChannel =
      selectedInput === "pointerXY" && secondary
        ? effectDriverChannel(secondary, { ...driver, axis: "y" })
        : null;
    const channels = secondChannel ? [channel, secondChannel] : [channel];
    try {
      previewEffectDriver(selected, channel, 0);
      if (secondChannel && secondary) previewEffectDriver(secondary, secondChannel, 0);
    } catch {
      setStatus("failed");
      return;
    }
    setRecording(true);
    finish.current = startEffectPreview(engine, {
      time: 0,
      sampleOnFinish: true,
      clock: {
        now: () => performance.now(),
        request: (callback) => requestAnimationFrame(callback),
        cancel: (handle) => cancelAnimationFrame(handle),
      },
      begin: () => latest.current.onStart?.(),
      preview: (seconds) => {
        if (output.current)
          output.current.value = t("effectMotion:live", { time: seconds.toFixed(2) });
        const first = previewEffectDriver(selected, channel, seconds * 1000);
        const second =
          secondChannel && secondary
            ? previewEffectDriver(secondary, secondChannel, seconds * 1000)
            : {};
        const patch = {
          ...first,
          ...second,
          ...(first.settings || second.settings
            ? { settings: { ...first.settings, ...second.settings } }
            : {}),
        };
        latest.current.onChange(
          patch.settings
            ? { ...patch, settings: { ...effect.settings, ...patch.settings } }
            : patch,
          true,
        );
      },
      commit: (seconds) => {
        latest.current.onCancel?.();
        if (!events.length) return;
        try {
          addEffectDriver(
            engine,
            effect,
            channels,
            t("effectMotion:recorded", { driver: t(`effectMotion:${selectedInput}`) }),
            // Keep release/impulse settling inside the authored block, even on an immediate Save.
            seconds * 1000 +
              (response === "direct" ? 0 : response === "rebound" ? 1500 : 1000) +
              (selectedInput.endsWith("Click") && clickMode === "impulse" ? 150 : 0),
          );
          showTimeline(true);
          createMotionTransport(engine).play();
          setStatus("saved");
        } catch {
          setStatus("failed");
        }
      },
      cancel: () => latest.current.onCancel?.(),
      stopped: () => {
        retireInput.current?.();
        retireInput.current = null;
        finish.current = null;
        take.current = null;
        setRecording(false);
      },
    });
    retireInput.current = beginEffectInputSession(engine, {
      owner: page
        ? {
            compositionId: page.id,
            ...(page.layers.find((layer) => layer.effects.some((item) => item.id === effect.id))
              ? {
                  layerId: page.layers.find((layer) =>
                    layer.effects.some((item) => item.id === effect.id),
                  )!.id,
                }
              : {}),
          }
        : undefined,
      kind: selectedInput,
      emit,
      cancel: () => finish.current?.(false),
    });
  }

  function emit(event: EffectPadInput) {
    const current = take.current;
    if (!current) return;
    const at = {
      value: Math.max(0, Math.round((performance.now() - current.started) * 1000)),
      rate: 1000000,
    };
    if (!appendMotionInput(current.events, { ...event, at })) {
      finish.current?.(false);
      setStatus("full");
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
            recording &&
            event.target instanceof Element &&
            event.target.closest("[data-effect-input-surface]")
          )
            event.preventDefault();
        }}
      >
        {property ? (
          <>
            <MotionChoices
              disabled={disabled}
              recording={recording}
              input={input}
              onAutomatic={add}
              onInput={(kind) =>
                record(
                  property,
                  kind === "primaryClick" && input === "secondaryClick" ? "secondaryClick" : kind,
                )
              }
            />
            {recording && (
              <div className="effect-motion-recording">
                <div className="effect-motion-recording-heading">
                  <span className="effect-motion-record-dot" />
                  <output ref={output} aria-live="off">
                    {t("effectMotion:recording")}
                  </output>
                </div>
                <InputPad kind={input} emit={emit} cancel={() => finish.current?.(false)} />
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
                  <SelectField
                    label={t("effectMotion:property")}
                    value={motionPropertyKey(property)}
                    disabled={disabled || recording}
                    options={properties.map((item) => ({
                      value: motionPropertyKey(item),
                      label: t(effectPropertyLabel(effect, item), {
                        defaultValue: item.target.property,
                      }),
                    }))}
                    onValueChange={setPropertyKey}
                  />
                  <DriverRangeFields
                    property={property}
                    value={outputRange}
                    disabled={disabled || recording}
                    onChange={(value) => setRange({ key: motionPropertyKey(property), value })}
                  />
                  <NumberInput
                    label={t("effectMotion:period")}
                    value={period}
                    min={0.1}
                    max={3600}
                    step={0.1}
                    unit="s"
                    disabled={disabled || recording}
                    onCommit={setPeriod}
                  />
                  <SelectField
                    label={t("effectMotion:input")}
                    value={input}
                    disabled={disabled || recording}
                    options={INPUTS.map((kind) => ({
                      value: kind,
                      label: t(`effectMotion:${kind}`),
                    }))}
                    onValueChange={(value) => setInput(value as MotionInputKind)}
                  />
                  {input === "pointerXY" && secondary && (
                    <SelectField
                      label={t("effectMotion:propertyY")}
                      value={motionPropertyKey(secondary)}
                      disabled={disabled || recording}
                      options={properties
                        .filter((item) => item !== property)
                        .map((item) => ({
                          value: motionPropertyKey(item),
                          label: t(effectPropertyLabel(effect, item), {
                            defaultValue: item.target.property,
                          }),
                        }))}
                      onValueChange={setSecondaryKey}
                    />
                  )}
                  <SelectField
                    label={t("effectMotion:response")}
                    value={response}
                    disabled={disabled || recording}
                    options={["direct", "smooth", "rebound"].map((value) => ({
                      value,
                      label: t(`effectMotion:${value}`),
                    }))}
                    onValueChange={setResponse}
                  />
                  {input.endsWith("Click") && (
                    <SelectField
                      label={t("effectMotion:clickMode")}
                      value={clickMode}
                      disabled={disabled || recording}
                      options={["impulse", "toggle"].map((value) => ({
                        value,
                        label: t(`effectMotion:${value}`),
                      }))}
                      onValueChange={setClickMode}
                    />
                  )}
                  {input === "pointerDrag" && (
                    <SelectField
                      label={t("effectMotion:release")}
                      value={returnOnRelease ? "return" : "hold"}
                      disabled={disabled || recording}
                      options={["return", "hold"].map((value) => ({
                        value,
                        label: t(`effectMotion:${value}`),
                      }))}
                      onValueChange={(value) => setReturnOnRelease(value === "return")}
                    />
                  )}
                </div>
              )}
            </div>
            {status && (
              <p role={status === "failed" || status === "full" ? "alert" : "status"}>
                {status === "saved" && <Check size={13} aria-hidden />}
                {t(`effectMotion:${status}`)}
              </p>
            )}
          </>
        ) : (
          <p>{t("effectMotion:unavailable")}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
