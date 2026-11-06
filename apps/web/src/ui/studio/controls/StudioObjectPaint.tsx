import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { EnginePort, Layer } from "@musart/core";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { IconButton } from "../../../components/shared/IconButton";
import { GradientControl } from "../../../components/properties/gradient/GradientControl";
import { gradientRamp } from "../../../components/properties/gradient/paint";
import { PaletteShortcut } from "../../../components/palettes/PaletteShortcut";
import { MotionColorControl } from "../../../components/properties/motion/MotionColorControl";

/** The contextual bar exposes the actual paint, rather than an obscured underlying solid color. */
export function StudioObjectPaint({
  engine,
  layer,
  disabled,
  preview,
  commit,
  cancel,
}: {
  engine: EnginePort;
  layer: Layer;
  disabled: boolean;
  preview: (patch: Partial<Layer>) => void;
  commit: (patch: Partial<Layer>) => void;
  cancel: () => void;
}) {
  const { t } = useTranslation("spatial");
  const swatch = useRef<HTMLSpanElement>(null);
  const background = layer.fillGradient ? gradientRamp(layer.fillGradient) : layer.fill;
  const materialPaint = (patch: Partial<Layer>): Partial<Layer> => ({
    ...patch,
    ...(layer.spatial ? { spatial: { ...layer.spatial, useModelMaterials: false } } : {}),
    ...(layer.vector ? { vector: { ...layer.vector, preserveColors: false } } : {}),
  });
  const paint = (patch: Partial<Layer>) => {
    if (swatch.current)
      swatch.current.style.background = patch.fillGradient
        ? gradientRamp(patch.fillGradient)
        : (patch.fill ?? background);
    preview(materialPaint(patch));
  };
  const restore = () => {
    if (swatch.current) swatch.current.style.background = background;
    cancel();
  };
  return (
    <>
      <Popover
        modal={false}
        open={disabled ? false : undefined}
        onOpenChange={(open) => {
          if (!open) restore();
        }}
      >
        <PopoverTrigger asChild>
          <IconButton label={t("color")} tooltipSide="top" disabled={disabled}>
            <span ref={swatch} className="studio-object-paint-swatch" style={{ background }} />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="center"
          className="studio-object-paint-popover"
          data-canvas-control
          aria-label={t("color")}
        >
          {layer.fillGradient ? (
            <GradientControl
              layer={layer}
              engine={engine}
              patch={(patch) => commit(materialPaint(patch))}
              preview={paint}
              cancel={restore}
            />
          ) : (
            <MotionColorControl
              showPaletteShortcut={false}
              engine={engine}
              label={t("color")}
              identity={layer.id}
              target={{ kind: "layer", layerId: layer.id, property: "fill" }}
              value={layer.fill}
              disabled={disabled}
              onPreview={(fill) => paint({ fill })}
              onCommit={(fill) => commit(materialPaint({ fill }))}
              onCancel={restore}
            />
          )}
        </PopoverContent>
      </Popover>
      <PaletteShortcut
        value={layer.fill}
        disabled={disabled}
        targets={[{ pageId: engine.getSnapshot().pageId, layerId: layer.id, property: "fill" }]}
        beforeApply={restore}
        onUse={(fill) => commit(materialPaint({ fill }))}
        onPreview={(fill) => paint({ fill })}
        onCancel={restore}
      />
    </>
  );
}
