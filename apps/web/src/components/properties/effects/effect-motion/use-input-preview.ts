import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { compileEffectMotionPreview, relativeEffectMotionAction } from "@musart/core";
import type { Effect, EnginePort, MotionInputEvent, MotionInputKind } from "@musart/core";
import { createMotionTransport } from "../../../../services/motion/transport";
import { startEffectPreview } from "../../../../state/session/effect-preview";
import {
  addEffectDriver,
  interactiveEffectChannels,
  effectMotionProperties,
  type EffectDriverProperty,
} from "./authoring";
import { appendMotionInput } from "./input-recording";
import { beginEffectInputSession } from "./input-session";
import type { EffectPadInput } from "./InputPad";
import type { DriverRange } from "./DriverRange";
export function useInputPreview({
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
}: {
  engine: EnginePort;
  effect: Effect;
  secondary?: EffectDriverProperty;
  input: MotionInputKind;
  response: string;
  clickMode: string;
  returnOnRelease: boolean;
  outputRange: DriverRange;
  setInput(this: void, value: MotionInputKind): void;
  setStatus(this: void, value: "saved" | "failed" | "full" | ""): void;
  showTimeline(this: void, value: boolean): void;
  onChange(this: void, patch: Partial<Effect>, preview?: boolean): void;
  onStart?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false),
    [testing, setTesting] = useState(false);
  const output = useRef<HTMLOutputElement>(null);
  const latest = useRef({ onChange, onStart, onCancel });
  latest.current = { onChange, onStart, onCancel };
  const finish = useRef<((commit?: boolean) => void) | null>(null),
    retireInput = useRef<(() => void) | null>(null);
  const take = useRef<{ started: number; events: MotionInputEvent[]; refresh?: () => void } | null>(
    null,
  );
  function record(
    selected: EffectDriverProperty,
    selectedInput: MotionInputKind = input,
    capture = false,
  ) {
    finish.current?.(false);
    const snapshot = engine.getSnapshot();
    const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId);
    const transport = createMotionTransport(engine);
    const wasPlaying = transport.read().playing;
    transport.pause();
    setInput(selectedInput);
    setStatus("");
    const events: MotionInputEvent[] = [];
    take.current = { started: performance.now(), events };
    const authored = interactiveEffectChannels(
      selected,
      selectedInput,
      { response, clickMode, returnOnRelease, range: outputRange, events },
      secondary,
    );
    let channel = authored[0]!,
      secondChannel = authored[1] ?? null;
    const binding = effect.motion?.interactive;
    if (binding?.channels[0]?.driver?.kind === selectedInput) {
      const properties = effectMotionProperties(engine, effect);
      const matches = (channel: (typeof binding.channels)[number]) =>
        properties.find(
          (property) =>
            property.target.property === channel.target.property &&
            property.target.kind.endsWith("Setting") === (channel.target.kind === "effectSetting"),
        );
      selected = matches(binding.channels[0]!) ?? selected;
      if (binding.channels[1]) secondary = matches(binding.channels[1]);
      const copies = structuredClone(binding.channels).map((copy) =>
        copy.driver && "events" in copy.driver
          ? { ...copy, driver: { ...copy.driver, events } }
          : copy,
      );
      channel = copies[0]!;
      secondChannel = copies[1] ?? null;
    }
    const channels = secondChannel ? [channel, secondChannel] : [channel];
    if (!page) {
      setStatus("failed");
      return;
    }
    const layerId = page.layers.find((layer) =>
      layer.effects.some((item) => item.id === effect.id),
    )?.id;
    const interactive = relativeEffectMotionAction(
      page,
      effect,
      { name: binding?.name ?? t(`effectMotion:${selectedInput}`), channels },
      effect.motion?.automatic,
      layerId,
    );
    const actions = [...(effect.motion?.automatic ? [effect.motion.automatic] : []), interactive];
    let sample = compileEffectMotionPreview(page, effect, actions, layerId);
    take.current!.refresh = () => {
      sample = compileEffectMotionPreview(page, effect, actions, layerId);
    };
    setRecording(capture);
    setTesting(!capture);
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
          output.current.value = t(capture ? "effectMotion:live" : "effectMotion:testing", {
            time: seconds.toFixed(2),
          });
        const patch = sample(seconds);
        latest.current.onChange(
          patch.settings
            ? { ...patch, settings: { ...effect.settings, ...patch.settings } }
            : patch,
          true,
        );
      },
      commit: (seconds) => {
        latest.current.onCancel?.();
        if (!capture || !events.length) return;
        try {
          addEffectDriver(
            engine,
            effect,
            interactive.channels,
            t("effectMotion:recorded", { driver: t(`effectMotion:${selectedInput}`) }),
            // Keep release/impulse settling inside the authored block, even on an immediate Save.
            seconds * 1000 +
              (response === "direct" ? 0 : response === "rebound" ? 1500 : 1000) +
              (selectedInput.endsWith("Click") && clickMode === "impulse" ? 150 : 0),
            true,
            effect.motion?.automatic,
          );
          showTimeline(true);
          createMotionTransport(engine).play();
          setStatus("saved");
        } catch {
          setStatus("failed");
        }
      },
      cancel: () => {
        latest.current.onCancel?.();
        if (wasPlaying) transport.play();
      },
      stopped: () => {
        retireInput.current?.();
        retireInput.current = null;
        finish.current = null;
        take.current = null;
        setRecording(false);
        setTesting(false);
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
    } else current.refresh?.();
  }

  return { record, emit, finish, output, recording, testing };
}
