import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../../ui/accordion";
import { EffectPositionPad } from "./EffectPositionPad";
import "./sdk/messages";
import { LiquifyControls } from "./LiquifyControls";
import { EffectImageInputs } from "./inputs/EffectImageInputs";
import "./gradient-messages";
import "./messages";
import "./library-messages";
import "./parameter-layout.css";
import { memo, useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { RotateCcw } from "lucide-react";
import {
  EFFECT_DOMAIN_KEYS,
  getEffectDefinition,
  getEffectParameter,
  isEffectParameterVisible,
  patchEffectParameter,
  resolveTrailMode,
  GRADIENT_PRESETS,
  type Effect,
  type EffectParameter,
  type EnginePort,
  type EffectMotionProperty,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import {
  EffectMotionNumberInput as NumberInput,
  EffectMotionField as MotionField,
  EffectMotionValueField as MotionValueField,
  type EffectFieldTarget,
} from "./effect-motion/fields";
import { createMotionTransport } from "../../../services/motion/transport";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import { SelectField } from "../../shared/SelectField";
import { Switch } from "../../ui/switch";
import { EffectPlayback } from "./EffectPlayback";
import { EffectColor } from "./EffectColor";
import { EffectText } from "./EffectText";
import { IconButton } from "../../shared/IconButton";
import { freezeEffectPreviews } from "../../../state/session/effect-preview";
import { useResetFeedback } from "../../shared/use-reset-feedback";
import { useParameterWindow } from "./use-parameter-window";
import { TrailOffsetInput } from "./library/trail/TrailOffsetInput";
export function EffectParameters({
  effect,
  engine,
  layerId,
  disabled = false,
  onChange,
  onStart,
  onCancel,
  deferOffscreen = false,
  parameterKeys,
  resetDefaults,
  hideActions = false,
}: {
  effect: Effect;
  engine?: EnginePort;
  layerId?: string;
  disabled?: boolean;
  onChange: (patch: Partial<Effect>, preview?: boolean) => void;
  onStart?: () => void;
  onCancel?: () => void;
  deferOffscreen?: boolean;
  /** Optional concise surfaces reuse the registry controls without duplicating them. */
  parameterKeys?: readonly string[];
  /** Specialized surfaces can retain structural settings such as a hard shadow's zero blur. */
  resetDefaults?: Partial<Pick<Effect, "amount" | "settings">>;
  hideActions?: boolean;
}) {
  const { t } = useTranslation();
  const definition = getEffectDefinition(effect.type);
  const snapshot = engine?.getSnapshot();
  const ownerPage = snapshot
    ? snapshot.project.pages.find((page) => page.id === snapshot.pageId)
    : undefined;
  const ownLayerId =
    layerId ??
    ownerPage?.layers.find((layer) => layer.effects.some((item) => item.id === effect.id))?.id;
  const transport = engine ? createMotionTransport(engine) : null;
  const displayed = useCallback(() => {
    const frame = transport?.readFrame();
    return (
      (ownLayerId
        ? frame?.layers
            .find((layer) => layer.id === ownLayerId)
            ?.effects.find((item) => item.id === effect.id)
        : frame?.effects?.find((item) => item.id === effect.id)) ?? effect
    );
  }, [transport, ownLayerId, effect]);
  const sourceResolved = useCallback(() => {
    const snapshot = engine?.getSnapshot();
    const page =
      transport?.readFrame() ?? snapshot?.project.pages.find((page) => page.id === snapshot.pageId);
    const current = displayed();
    return page ? resolveTrailMode(current, page, ownLayerId) : current;
  }, [engine, transport, displayed, ownLayerId]);
  const shape = useCallback(
    () =>
      definition.parameters
        .filter(
          (parameter) =>
            (parameterKeys
              ? parameterKeys.includes(parameter.key)
              : !EFFECT_DOMAIN_KEYS.includes(parameter.key)) &&
            isEffectParameterVisible(sourceResolved(), parameter),
        )
        .map((parameter) => `${parameter.scope}:${parameter.key}`)
        .join("|"),
    [definition, sourceResolved, parameterKeys],
  );
  useSyncExternalStore(transport?.subscribe ?? noSubscription, shape, shape);
  const owner = `${effect.id}:${effect.type}:${parameterKeys?.join("|") ?? "all"}`;
  const [colorOwner, setColorOwner] = useState(owner);
  const [openColorKey, setOpenColorKey] = useState<string | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const changeColorOpen = useCallback(
    (key: string, open: boolean) => {
      setOpenColorKey((current) => (open ? key : current === key ? null : current));
    },
    [setOpenColorKey],
  );
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const feedback = useResetFeedback(root);
  const parameters = definition.parameters.filter(
    (parameter) =>
      (parameterKeys
        ? parameterKeys.includes(parameter.key)
        : !EFFECT_DOMAIN_KEYS.includes(parameter.key)) &&
      isEffectParameterVisible(sourceResolved(), parameter),
  );
  const window = useParameterWindow(list, owner, parameters.length, deferOffscreen);
  if (colorOwner !== owner) {
    setColorOwner(owner);
    setOpenColorKey(null);
  }
  const defaults: Effect = useMemo(
    () => ({
      id: effect.id,
      type: effect.type,
      ...definition.defaults,
      ...resetDefaults,
      settings: resetDefaults?.settings
        ? { ...definition.defaults.settings, ...resetDefaults.settings }
        : definition.defaults.settings,
    }),
    [effect.id, effect.type, definition.defaults, resetDefaults],
  );

  return (
    <div
      ref={root}
      className="effect-controls reset-feedback"
      data-effect-parameter-count={parameters.length}
    >
      {effect.type === "liquify" && (
        <LiquifyControls engine={engine} layerId={ownLayerId} effect={effect} onChange={onChange} />
      )}
      <EffectImageInputs engine={engine} layerId={ownLayerId} effect={effect} disabled={disabled} />
      {!hideActions && (
        <div className="effect-controls-actions">
          <IconButton
            label={t("effectControls:resetAll")}
            disabled={disabled}
            data-effect-reset=""
            onPointerDown={(event) => {
              if (event.button === 0) event.preventDefault();
            }}
            onClick={() => {
              if (engine) freezeEffectPreviews(engine, false);
              onCancel?.();
              setOpenColorKey(null);
              setResetVersion((version) => version + 1);
              const changed =
                definition.parameters.some(
                  (parameter) =>
                    getEffectParameter(displayed(), parameter) !==
                    getEffectParameter(defaults, parameter),
                ) ||
                Object.keys(displayed().inputs ?? {}).length > 0 ||
                (displayed().opacity ?? 1) !== 1 ||
                (displayed().blendMode ?? "normal") !== "normal" ||
                displayed().composite !== undefined;
              if (changed)
                onChange(
                  {
                    ...definition.defaults,
                    amount: defaults.amount,
                    inputs: undefined,
                    enabled: displayed().enabled,
                    settings: defaults.settings ? { ...defaults.settings } : undefined,
                    time: defaults.time,
                    opacity: 1,
                    blendMode: "normal",
                    composite: undefined,
                  },
                  false,
                );
              if (!matchMedia("(prefers-reduced-motion: reduce)").matches) feedback();
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </IconButton>
        </div>
      )}
      {!hideActions && engine && !definition.retired && definition.source !== "geometry" && (
        <EffectPlayback
          engine={engine}
          effect={effect}
          disabled={disabled}
          onChange={onChange}
          onStart={onStart}
          onCancel={onCancel}
        />
      )}
      <div
        ref={list}
        className={`effect-parameter-list ${window.virtual ? "is-virtual" : ""}`}
        style={window.virtual ? { height: window.height } : undefined}
        onFocusCapture={window.remember}
        onPointerDownCapture={(event) => {
          window.remember(event);
          if (event.button !== 0 || !openColorKey) return;
          const trigger = (event.target as Element).closest('[data-slot="popover-trigger"]');
          const row = trigger?.closest<HTMLElement>("[data-parameter-index]");
          const parameter = row && parameters[Number(row.dataset.parameterIndex)];
          // React's discrete pointer event closes the old editor before native focus/blur can commit it.
          if (parameter?.kind === "color" && parameter.key !== openColorKey) setOpenColorKey(null);
        }}
        onKeyDownCapture={window.keyDown}
      >
        {window.indices.map((index) => {
          const parameter = parameters[index]!;
          return (
            <div
              key={`${parameter.key}:${resetVersion}`}
              className="effect-parameter-row"
              data-parameter-index={index}
              data-parameter-kind={parameter.kind}
              style={window.virtual ? { top: window.rowTop(index) } : undefined}
            >
              <ParameterField
                engine={engine}
                layerId={ownLayerId}
                compositionId={ownerPage?.id}
                effect={effect}
                displayedEffect={sourceResolved()}
                parameter={parameter}
                defaults={defaults}
                disabled={disabled}
                t={t}
                colorOpen={openColorKey === parameter.key}
                onColorOpenChange={changeColorOpen}
                onChange={onChange}
                onStart={onStart}
                onCancel={onCancel}
              />
            </div>
          );
        })}
      </div>
      {!parameterKeys && definition.sdk?.placement && (
        <Accordion type="single" collapsible className="effect-placement">
          <AccordionItem value="placement">
            <AccordionTrigger>{t("effectDomain:title")}</AccordionTrigger>
            <AccordionContent className="effect-placement-body">
              <EffectPositionPad
                effect={effect}
                engine={engine}
                layerId={ownLayerId}
                disabled={disabled}
                onChange={onChange}
                onStart={onStart}
                onCancel={onCancel}
              />
              <EffectParameters
                effect={effect}
                engine={engine}
                layerId={ownLayerId}
                disabled={disabled}
                onChange={onChange}
                onStart={onStart}
                onCancel={onCancel}
                parameterKeys={EFFECT_DOMAIN_KEYS}
                hideActions
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

/** Retain mounted controls through window and focus updates; canonical edits still rebind every field. */
const ParameterField = memo(function ParameterField({
  effect,
  displayedEffect,
  engine,
  layerId,
  compositionId,
  parameter,
  defaults,
  disabled,
  t,
  colorOpen,
  onColorOpenChange,
  onChange,
  onStart,
  onCancel,
}: {
  effect: Effect;
  displayedEffect: Effect;
  engine?: EnginePort;
  layerId?: string;
  compositionId?: string;
  parameter: EffectParameter;
  defaults: Effect;
  disabled: boolean;
  t: ReturnType<typeof useTranslation>["t"];
  colorOpen: boolean;
  onColorOpenChange: (key: string, open: boolean) => void;
  onChange: (patch: Partial<Effect>, preview?: boolean) => void;
  onStart?: () => void;
  onCancel?: () => void;
}) {
  const label = t(parameter.labelKey);
  const value = getEffectParameter(parameter.key === "mode" ? effect : displayedEffect, parameter);
  const target: EffectFieldTarget | undefined = layerId
    ? parameter.scope === "settings"
      ? {
          kind: "effectSetting",
          layerId,
          effectId: effect.id,
          property: parameter.key,
        }
      : {
          kind: "effect",
          layerId,
          effectId: effect.id,
          property: parameter.key as EffectMotionProperty,
        }
    : compositionId
      ? parameter.scope === "settings"
        ? {
            kind: "compositionEffectSetting",
            compositionId,
            effectId: effect.id,
            property: parameter.key,
          }
        : {
            kind: "compositionEffect",
            compositionId,
            effectId: effect.id,
            property: parameter.key as EffectMotionProperty,
          }
      : undefined;
  const trailOffset = effect.type === "trail" && ["offsetX", "offsetY"].includes(parameter.key);
  const change = (next: number | boolean | string, preview = false) => {
    // Persist the visible paired offset on first edit while retaining the Auto selector.
    const current = trailOffset
      ? {
          ...effect,
          settings: {
            ...effect.settings,
            offsetX: displayedEffect.settings?.offsetX ?? 0,
            offsetY: displayedEffect.settings?.offsetY ?? 0,
          },
        }
      : effect;
    onChange(patchEffectParameter(current, parameter, next), preview);
  };
  if (parameter.kind === "text")
    return (
      <MotionField engine={engine} target={target} label={label} disabled={disabled}>
        <MotionValueField engine={engine} target={target} fallback={value}>
          {(live) => (
            <EffectText
              identity={effect}
              label={label}
              value={String(live)}
              minLength={parameter.minLength}
              maxLength={parameter.maxLength}
              hint={parameter.descriptionKey ? t(parameter.descriptionKey) : undefined}
              disabled={disabled}
              onStart={onStart}
              onPreview={(next) => change(next, true)}
              onCommit={(next) => change(next)}
              onCancel={onCancel}
            />
          )}
        </MotionValueField>
      </MotionField>
    );
  if (parameter.kind === "boolean")
    return (
      <MotionField engine={engine} target={target} label={label} disabled={disabled}>
        <MotionValueField engine={engine} target={target} fallback={value}>
          {(live) => (
            <label className="switch-row">
              <span>{label}</span>
              <Switch
                disabled={disabled}
                checked={Boolean(live)}
                aria-label={label}
                onCheckedChange={(next) => change(next)}
              />
            </label>
          )}
        </MotionValueField>
      </MotionField>
    );
  if (parameter.kind === "select")
    return (
      <MotionField engine={engine} target={target} label={label} disabled={disabled}>
        <MotionValueField engine={engine} target={target} fallback={value}>
          {(live) => (
            <label className="effect-select-field">
              <span>{label}</span>
              <SelectField
                identity={effect}
                label={label}
                value={String(live)}
                disabled={disabled}
                onValueChange={(next) => change(next)}
                options={parameter.options.map((option) => {
                  const preset =
                    parameter.key === "preset"
                      ? GRADIENT_PRESETS.find((item) => item.id === option.value)
                      : undefined;
                  return {
                    value: option.value,
                    label: preset ? (
                      <span className="effect-preset-choice">
                        <span
                          aria-hidden="true"
                          className="effect-preset-swatch"
                          style={{
                            background: `linear-gradient(100deg, ${preset.colors.join(",")})`,
                          }}
                        />
                        {t(option.labelKey)}
                      </span>
                    ) : (
                      t(option.labelKey)
                    ),
                  };
                })}
              />
            </label>
          )}
        </MotionValueField>
      </MotionField>
    );
  if (parameter.kind === "color")
    return (
      <MotionField engine={engine} target={target} label={label} disabled={disabled}>
        <MotionValueField engine={engine} target={target} fallback={value}>
          {(live) => (
            <EffectColor
              invalidation={engine ? motionTimeChanges(engine) : undefined}
              identity={`${effect.id}:${effect.type}:${parameter.key}`}
              label={label}
              value={String(live)}
              open={colorOpen}
              onOpenChange={(open) => onColorOpenChange(parameter.key, open)}
              resetValue={String(getEffectParameter(defaults, parameter))}
              onReset={() => {
                onCancel?.();
                change(getEffectParameter(defaults, parameter));
              }}
              disabled={disabled}
              onStart={onStart}
              onPreview={(next) => change(next, true)}
              onCommit={(next) => change(next)}
              onCancel={onCancel}
            />
          )}
        </MotionValueField>
      </MotionField>
    );
  const numericProps = {
    engine,
    target,
    displayScale: parameter.displayScale,
    decimalScale: parameter.integer ? 0 : undefined,
    identity: effect,
    label,
    value: Number(value) * parameter.displayScale,
    resetValue: () => Number(getEffectParameter(defaults, parameter)) * parameter.displayScale,
    disabled,
    min: parameter.min * parameter.displayScale,
    max: parameter.max * parameter.displayScale,
    step: parameter.step * parameter.displayScale,
    unit: parameter.unit,
    onStart,
    onPreview: (next: number) => change(next / parameter.displayScale, true),
    onCancel,
    onCommit: (next: number) => change(next / parameter.displayScale),
  };
  return trailOffset ? (
    <TrailOffsetInput {...numericProps} effect={effect} parameter={parameter} layerId={layerId} />
  ) : (
    <NumberInput {...numericProps} />
  );
});

function noSubscription() {
  return () => {};
}
