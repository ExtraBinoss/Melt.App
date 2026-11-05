import { useLayoutEffect, useMemo, useRef } from "react";
import type { EnginePort, FillGradient, Layer, MotionPropertyTarget } from "@musart/core";
import { useTranslation } from "react-i18next";
import { SegmentedTabs } from "../../../components/shared/segmented/SegmentedTabs";
import { GradientControl } from "../../../components/properties/gradient/GradientControl";
import { gradientRamp } from "../../../components/properties/gradient/paint";
import { Button } from "../../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import "../../../components/properties/gradient/messages";
import "./material-paint.css";
import { EffectColor } from "../../../components/properties/effects/EffectColor";
import { MotionField } from "../../../components/properties/motion/MotionField";
import { MotionValueField } from "../../../components/properties/motion/MotionValueField";
import { usePaintScope } from "../../../components/properties/motion/paint-scope";

/** The primary object paint control edits the current native paint, including its stops. */
export function StudioMaterialPaint({
  engine,
  layer,
  label,
  disabled,
  onPreview,
  onCommit,
  onCancel,
}: {
  engine: EnginePort;
  layer: Layer;
  label: string;
  disabled: boolean;
  onPreview: (patch: Partial<Layer>) => void;
  onCommit: (patch: Partial<Layer>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("gradient");
  const gradient = layer.fillGradient;
  function chooseMode(mode: string) {
    onCancel();
    if (mode === "solid")
      onCommit({ fill: gradient?.stops[0]?.color ?? layer.fill, fillGradient: undefined });
    else {
      const fillGradient: FillGradient = {
        kind: "linear",
        angle: 0,
        stops: [
          { offset: 0, color: layer.fill },
          { offset: 1, color: "#ffffff" },
        ],
      };
      onCommit({ fillGradient });
    }
  }
  return (
    <div className="studio-material-paint">
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
        onValueChange={chooseMode}
      />
      {gradient ? (
        <Popover
          modal={false}
          onOpenChange={(open) => {
            if (!open) onCancel();
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" aria-label={t("gradient")} disabled={disabled}>
              <span className="color-swatch" style={{ backgroundImage: gradientRamp(gradient) }} />
              {t(gradient.kind)}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="studio-material-paint-popover"
            side="left"
            aria-label={t("gradient")}
            data-canvas-control
          >
            <GradientControl
              layer={layer}
              engine={engine}
              patch={onCommit}
              preview={onPreview}
              cancel={onCancel}
            />
          </PopoverContent>
        </Popover>
      ) : (
        <MaterialSolidColor
          engine={engine}
          layerId={layer.id}
          label={label}
          value={layer.fill}
          disabled={disabled}
          onPreview={(fill) => onPreview({ fill })}
          onCommit={(fill) => onCommit({ fill })}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

/** A visible compact color row retains the shared Motion target and native palette. */
function MaterialSolidColor({
  engine,
  layerId,
  label,
  value,
  disabled,
  onPreview,
  onCommit,
  onCancel,
}: {
  engine: EnginePort;
  layerId: string;
  label: string;
  value: string;
  disabled: boolean;
  onPreview: (value: string) => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const scope = usePaintScope(engine);
  const target = useMemo<MotionPropertyTarget>(
    () => ({ kind: "layer", layerId, property: "fill" }),
    [layerId],
  );
  const latest = useRef({ onPreview, onCommit, onCancel });
  useLayoutEffect(() => {
    latest.current = { onPreview, onCommit, onCancel };
  });
  const callbacks = useMemo(
    () => ({
      onPreview: (color: string) => latest.current.onPreview(color),
      onCommit: (color: string) => latest.current.onCommit(color),
      onCancel: () => latest.current.onCancel(),
    }),
    [],
  );
  const identity = `${scope.identity}:${layerId}:fill`;
  return (
    <MotionField engine={engine} target={target} label={label} disabled={disabled}>
      <MotionValueField engine={engine} target={target} fallback={value}>
        {(color) => (
          <EffectColor
            {...callbacks}
            key={identity}
            label={label}
            value={String(color)}
            disabled={disabled}
            identity={identity}
            invalidation={scope.invalidation}
          />
        )}
      </MotionValueField>
    </MotionField>
  );
}
