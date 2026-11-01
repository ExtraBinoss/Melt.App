import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RetainedPaint } from "./retained-paint";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  Composition,
  EnginePort,
  FillGradient,
  Layer,
  MotionPropertyTarget,
} from "@musart/core";
import type { PropertyActions } from "../TextProperties";
import { MotionNumberInput as NumberInput } from "../motion/MotionNumberInput";
import { MotionField } from "../motion/MotionField";
import { MotionValueField } from "../motion/MotionValueField";
import { usePaintScope, type PaintInvalidation } from "../motion/paint-scope";
import { createMotionTransport } from "../../../services/motion/transport";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import { SelectField } from "../../shared/SelectField";
import { IconButton } from "../../shared/IconButton";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import { GradientPresets } from "./GradientPresets";
import { GradientBar } from "./GradientBar";
import { GradientStopRow } from "./GradientStopRow";
import { gradientRamp, insertStop, replaceStop, stopColorFields } from "./paint";
import styles from "./GradientControl.module.css";
import "./messages";

function presentPaint(root: HTMLElement | null, paint: FillGradient) {
  const ramp = root?.querySelector<HTMLElement>("[data-gradient-ramp]");
  if (ramp) ramp.style.backgroundImage = gradientRamp(paint);
  paint.stops.forEach((stop, at) => {
    const thumb = root?.querySelector<HTMLElement>(`[data-gradient-thumb="${at}"]`);
    if (thumb) {
      thumb.style.left = `${stop.offset * 100}%`;
      thumb.style.backgroundColor = stop.color;
      thumb.setAttribute("aria-valuenow", String(stop.offset * 100));
      thumb.setAttribute("aria-valuetext", `${Math.round(stop.offset * 100)}%`);
    }
    const row = root?.querySelector<HTMLElement>(`[data-gradient-row="${at}"]`);
    const swatch = row?.querySelector<HTMLElement>("[data-gradient-swatch]");
    if (swatch) swatch.style.backgroundColor = stop.color;
    const fields = stopColorFields(stop.color);
    for (const [selector, value] of [
      ["[data-gradient-position] input", String(Math.round(stop.offset * 10000) / 100)],
      ["[data-gradient-opacity] input", String(Math.round(fields.opacity * 100) / 100)],
      ["[data-gradient-hex]", fields.hex],
    ] as const) {
      const input = row?.querySelector<HTMLInputElement>(selector);
      if (input && document.activeElement !== input) input.value = value;
    }
  });
}

/** Only selection and committed commands render React; continuous paint drafts stay imperative. */
export function GradientControl({
  layer,
  engine,
  patch,
  preview,
  cancel,
}: PropertyActions & { layer: Layer; engine?: EnginePort }) {
  return (
    <PaintGradientControl
      ownerId={layer.id}
      identity={layer}
      layerId={layer.id}
      engine={engine}
      color={layer.fill}
      gradient={layer.fillGradient}
      disabled={layer.locked}
      onPreview={(fillGradient) => preview({ fillGradient })}
      onCommit={(fillGradient) => patch({ fillGradient })}
      onCancel={cancel}
    />
  );
}
export function BackgroundGradientControl({
  page,
  engine,
  preview,
  patch,
  cancel,
}: {
  page: Composition;
  engine?: EnginePort;
  preview: (patch: Partial<Composition>) => void;
  patch: (patch: Partial<Composition>) => void;
  cancel: () => void;
}) {
  const scope = usePaintScope(engine);
  const committed = useRef({ preview, patch, cancel });
  useLayoutEffect(() => {
    committed.current = { preview, patch, cancel };
  });
  const actions = useMemo(
    () => ({
      onPreview: (backgroundGradient: FillGradient) =>
        committed.current.preview({ backgroundGradient }),
      onCommit: (backgroundGradient: FillGradient | undefined) =>
        committed.current.patch({ backgroundGradient }),
      onCancel: () => committed.current.cancel(),
    }),
    [],
  );
  const ownerId = `${scope.identity}:page:${page.id}`;
  return (
    <BackgroundPaintLeaf
      key={ownerId}
      ownerId={ownerId}
      identity={engine ? ownerId : page}
      engine={engine}
      color={page.background}
      gradient={page.backgroundGradient}
      presentation={engine ? scope.invalidation : undefined}
      {...actions}
    />
  );
}
function PaintGradientControl({
  ownerId,
  identity,
  layerId,
  engine,
  color,
  gradient,
  disabled = false,
  onPreview,
  onCommit,
  onCancel,
  presentation,
}: {
  ownerId: string;
  identity: unknown;
  layerId?: string;
  engine?: EnginePort;
  color: string;
  gradient?: FillGradient;
  disabled?: boolean;
  onPreview: (paint: FillGradient) => void;
  onCommit: (paint: FillGradient | undefined) => void;
  onCancel: () => void;
  presentation?: PaintInvalidation;
}) {
  const { t } = useTranslation("gradient");
  const [selection, setSelection] = useState({ ownerId, index: 0 });
  const [remembered, setRemembered] = useState<FillGradient | undefined>(() =>
    layerId
      ? undefined
      : (gradient ?? {
          kind: "linear",
          angle: 0,
          stops: [
            { offset: 0, color },
            { offset: 1, color: "#ffffff" },
          ],
        }),
  );
  // Mode changes may recreate an identical default gradient. Preserve its exact
  // authored identity so a retained editor does not rebuild its fields on return.
  if (!layerId && gradient && !sameAuthoredPaint(gradient, remembered)) setRemembered(gradient);
  const paint = layerId ? gradient : remembered;
  const root = useRef<HTMLDivElement>(null);
  const index =
    selection.ownerId === ownerId
      ? Math.min(selection.index, (gradient?.stops.length ?? 1) - 1)
      : 0;
  const invalidation = presentation ?? (engine ? motionTimeChanges(engine) : undefined);
  const anglePresentation = useMemo(
    () =>
      presentation && {
        read: () => paint?.angle ?? 0,
        subscribe: presentation.subscribe,
      },
    [presentation, paint?.angle],
  );
  const drafting = useRef(false);
  useLayoutEffect(
    () =>
      presentation?.subscribe(() => {
        if (!drafting.current) return;
        drafting.current = false;
        if (gradient) presentPaint(root.current, gradient);
        onCancel();
      }),
    [presentation, gradient, onCancel],
  );
  const select = useCallback(
    (index: number) => {
      setSelection((current) =>
        current.ownerId === ownerId && current.index === index ? current : { ownerId, index },
      );
    },
    [ownerId],
  );
  useLayoutEffect(() => {
    if (!engine || !gradient) return;
    const transport = createMotionTransport(engine);
    const update = () =>
      presentPaint(
        root.current,
        (layerId
          ? transport.readFrame()?.layers.find((item) => item.id === layerId)?.fillGradient
          : transport.readFrame()?.backgroundGradient) ?? gradient,
      );
    const stop = transport.subscribe(update);
    update();
    return stop;
  }, [engine, layerId, gradient]);
  const previewPaint = useCallback(
    (next: FillGradient) => {
      if (disabled) return;
      drafting.current = true;
      presentPaint(root.current, next);
      onPreview(next);
    },
    [disabled, onPreview],
  );
  const commitPaint = useCallback(
    (next: FillGradient) => {
      drafting.current = false;
      if (!disabled) onCommit(next);
    },
    [disabled, onCommit],
  );
  const cancelPaint = useCallback(() => {
    drafting.current = false;
    if (paint) presentPaint(root.current, paint);
    onCancel();
  }, [paint, onCancel]);
  const editor = useMemo(() => {
    if (!paint) return null;
    const target = (
      property: "fillGradient.kind" | "fillGradient.angle",
    ): MotionPropertyTarget | undefined =>
      layerId ? { kind: "layer", layerId, property } : undefined;
    return (
      <div className={styles.editor} inert={disabled || undefined}>
        <GradientPresets
          identity={ownerId}
          gradient={paint}
          disabled={disabled}
          onPreview={previewPaint}
          onCommit={commitPaint}
          onCancel={cancelPaint}
        />
        <div className={styles.settings}>
          <div className={styles.setting}>
            <span className={styles.caption}>{t("gradient")}</span>
            <MotionField
              engine={engine}
              target={target("fillGradient.kind")}
              label={t("gradientType")}
              disabled={disabled}
            >
              <MotionValueField
                engine={engine}
                target={target("fillGradient.kind")}
                fallback={paint.kind}
              >
                {(kind) => (
                  <SelectField
                    label={t("gradientType")}
                    side="bottom"
                    value={String(kind)}
                    disabled={disabled}
                    options={(["linear", "radial"] as const).map((value) => ({
                      value,
                      label: t(value),
                    }))}
                    onValueChange={(kind) =>
                      commitPaint({ ...paint, kind: kind as FillGradient["kind"] })
                    }
                  />
                )}
              </MotionValueField>
            </MotionField>
          </div>
          {paint.kind === "linear" && (
            <div className={styles.setting}>
              <span className={styles.caption}>{t("angleLabel")}</span>
              <NumberInput
                engine={engine}
                target={target("fillGradient.angle")}
                identity={identity}
                presentation={anglePresentation}
                label={t("angle")}
                value={paint.angle}
                min={-360000}
                max={360000}
                unit="°"
                disabled={disabled}
                onPreview={(angle) => previewPaint({ ...paint, angle })}
                onCommit={(angle) => commitPaint({ ...paint, angle })}
                onCancel={cancelPaint}
              />
            </div>
          )}
        </div>
        <GradientBar
          gradient={paint}
          identity={ownerId}
          selected={index}
          disabled={disabled}
          invalidation={invalidation}
          onSelect={select}
          onPreview={previewPaint}
          onCommit={commitPaint}
          onCancel={cancelPaint}
        />
        <div className={styles.stopsHeading}>
          <span className={styles.caption}>{t("stops")}</span>
          <IconButton
            label={t("add")}
            disabled={disabled || paint.stops.length >= 8}
            onClick={() => {
              if (disabled) return;
              const next = insertStop(paint);
              if (next) {
                select(next.index);
                commitPaint(next.gradient);
              }
            }}
          >
            <Plus size={14} />
          </IconButton>
        </div>
        <div className={styles.rows}>
          {paint.stops.map((_, at) => (
            <GradientStopRow
              key={`${ownerId}:${at}`}
              gradient={paint}
              index={at}
              ownerId={ownerId}
              identity={identity}
              selected={at === index}
              disabled={disabled}
              invalidation={invalidation}
              onSelect={() => select(at)}
              onPreview={(change) => previewPaint(replaceStop(paint, at, change))}
              onCommit={(change) => commitPaint(replaceStop(paint, at, change))}
              onCancel={cancelPaint}
              onRemove={() => {
                if (
                  disabled ||
                  at === 0 ||
                  at === paint.stops.length - 1 ||
                  paint.stops.length <= 2
                )
                  return;
                select(Math.max(0, at - 1));
                commitPaint({
                  ...paint,
                  stops: paint.stops.filter((_, position) => position !== at),
                });
              }}
            />
          ))}
        </div>
      </div>
    );
  }, [
    paint,
    disabled,
    engine,
    layerId,
    identity,
    ownerId,
    index,
    invalidation,
    anglePresentation,
    select,
    previewPaint,
    commitPaint,
    cancelPaint,
    t,
  ]);
  return (
    <div ref={root} className={styles.control} aria-disabled={disabled || undefined}>
      <SegmentedTabs
        mode="choice"
        size="compact"
        label={t("type")}
        value={gradient ? "gradient" : "solid"}
        disabled={disabled}
        items={[
          { value: "solid", label: t("solid") },
          { value: "gradient", label: t("gradient") },
        ]}
        onValueChange={(value) => {
          if (disabled) return;
          cancelPaint();
          select(0);
          onCommit(
            value === "solid"
              ? undefined
              : {
                  kind: "linear",
                  angle: 0,
                  stops: [
                    { offset: 0, color },
                    { offset: 1, color: "#ffffff" },
                  ],
                },
          );
        }}
      />
      {paint && (
        <RetainedPaint
          key={ownerId}
          visible={Boolean(gradient)}
          retain={!layerId}
          prepare={!layerId}
        >
          {editor}
        </RetainedPaint>
      )}
    </div>
  );
}
const BackgroundPaintLeaf = memo(PaintGradientControl);

/** Exact comparison: retaining presentation must not normalize authored values. */
function sameAuthoredPaint(a: FillGradient, b: FillGradient | undefined): boolean {
  return Boolean(
    b &&
    a.kind === b.kind &&
    a.angle === b.angle &&
    a.stops.length === b.stops.length &&
    a.stops.every(
      (stop, index) =>
        stop.offset === b.stops[index]!.offset && stop.color === b.stops[index]!.color,
    ),
  );
}
