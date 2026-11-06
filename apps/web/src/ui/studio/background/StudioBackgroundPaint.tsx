import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Circle, CircleDashed, Settings2 } from "lucide-react";
import type { ColorTarget, EnginePort, FillGradient } from "@musart/core";
import { IconButton } from "../../../components/shared/IconButton";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { EffectColor } from "../../../components/properties/effects/EffectColor";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import { StudioDirectionPad } from "../controls/StudioDirectionPad";
import { StudioSlider } from "../controls/StudioSlider";
import "../../../components/properties/gradient/messages";
import "../../../components/spatial/messages";
import "../catalog/scene-controls.css";

export interface StudioPaint {
  color: string;
  gradient?: FillGradient;
}

/** A compact facade over ordinary composition/layer paint, never a separate background system. */
export function StudioBackgroundPaint({
  engine,
  identity,
  ownerId,
  color,
  gradient,
  disabled = false,
  preview,
  commit,
  cancel,
  advanced,
  paletteTargets,
}: StudioPaint & {
  engine: EnginePort;
  identity: unknown;
  ownerId: string;
  disabled?: boolean;
  preview: (paint: StudioPaint) => void;
  commit: (paint: StudioPaint) => void;
  cancel: () => void;
  advanced: ReactNode;
  paletteTargets?: ColorTarget[];
}) {
  const { t } = useTranslation("studioBackground");
  const { t: g } = useTranslation("gradient");
  const { t: spatial } = useTranslation("spatial");
  const mode = gradient
    ? "gradient"
    : /(?:^transparent$|^#[0-9a-f]{6}00$)/i.test(color)
      ? "none"
      : "solid";
  const makeGradient = (): FillGradient =>
    gradient ?? {
      kind: "linear",
      angle: 90,
      stops: [
        { offset: 0, color: mode === "none" ? "#202024" : color },
        { offset: 1, color: "#8B74CF" },
      ],
    };
  const change = (next: FillGradient, final: boolean) =>
    (final ? commit : preview)({ color, gradient: next });
  const invalidation = motionTimeChanges(engine);
  return (
    <div className="studio-background-paint">
      <div className="studio-background-modes" role="group" aria-label={g("type")}>
        {(["none", "solid", "gradient"] as const).map((value) => (
          <IconButton
            key={value}
            label={value === "none" ? t("transparent") : g(value)}
            tooltipSide="top"
            disabled={disabled}
            active={mode === value}
            onClick={() => {
              cancel();
              commit(
                value === "none"
                  ? { color: "#00000000" }
                  : value === "solid"
                    ? {
                        color: /(?:^transparent$|^#[0-9a-f]{6}00$)/i.test(color)
                          ? (gradient?.stops[0]?.color ?? "#F1F0EC")
                          : color,
                      }
                    : { color, gradient: makeGradient() },
              );
            }}
          >
            {value === "none" ? (
              <CircleDashed size={19} />
            ) : value === "solid" ? (
              <Circle size={19} fill="currentColor" />
            ) : (
              <span className="studio-gradient-icon" />
            )}
          </IconButton>
        ))}
        <Popover modal={false}>
          <PopoverTrigger asChild>
            <IconButton label={spatial("advanced")} tooltipSide="top" disabled={disabled}>
              <Settings2 size={15} />
            </IconButton>
          </PopoverTrigger>
          <PopoverContent
            side="left"
            align="end"
            className="studio-background-advanced"
            data-canvas-control
            initialFocus="content"
          >
            {advanced}
          </PopoverContent>
        </Popover>
      </div>
      {mode === "solid" && (
        <EffectColor
          invalidation={invalidation}
          paletteTargets={paletteTargets}
          label={t("title")}
          identity={`${ownerId}:color`}
          value={color}
          disabled={disabled}
          onPreview={(color) => preview({ color })}
          onCommit={(color) => commit({ color })}
          onCancel={cancel}
        />
      )}
      {gradient && (
        <>
          <div className="studio-background-types" role="group" aria-label={g("gradientType")}>
            {(["linear", "radial"] as const).map((kind) => (
              <IconButton
                key={kind}
                label={g(kind)}
                tooltipSide="top"
                active={gradient.kind === kind}
                disabled={disabled}
                onClick={() => change({ ...gradient, kind }, true)}
              >
                <span className="studio-gradient-icon" data-gradient-kind={kind} />
              </IconButton>
            ))}
          </div>
          <fieldset className="studio-background-fields" disabled={disabled}>
            <StudioDirectionPad
              key={gradient.kind}
              label={gradient.kind === "radial" ? t("position") : g("angle")}
              identity={identity}
              invalidation={invalidation}
              value={
                gradient.kind === "radial"
                  ? { x: gradient.centerX ?? 0.5, y: 1 - (gradient.centerY ?? 0.5) }
                  : {
                      x: Math.cos((gradient.angle * Math.PI) / 180),
                      y: -Math.sin((gradient.angle * Math.PI) / 180),
                    }
              }
              minX={gradient.kind === "radial" ? 0 : -1}
              maxX={1}
              minY={gradient.kind === "radial" ? 0 : -1}
              maxY={1}
              step={0.01}
              projectValue={
                gradient.kind === "linear"
                  ? ({ x, y }) => {
                      const length = Math.hypot(x, y);
                      return length > 0.001
                        ? { x: x / length, y: y / length }
                        : {
                            x: Math.cos((gradient.angle * Math.PI) / 180),
                            y: -Math.sin((gradient.angle * Math.PI) / 180),
                          };
                    }
                  : undefined
              }
              onStart={() => {}}
              onPreview={({ x, y }) =>
                change(
                  gradient.kind === "radial"
                    ? { ...gradient, centerX: x, centerY: 1 - y }
                    : { ...gradient, angle: (Math.atan2(-y, x) * 180) / Math.PI },
                  false,
                )
              }
              onCommit={({ x, y }) =>
                change(
                  gradient.kind === "radial"
                    ? { ...gradient, centerX: x, centerY: 1 - y }
                    : { ...gradient, angle: (Math.atan2(-y, x) * 180) / Math.PI },
                  true,
                )
              }
              onCancel={cancel}
            />
            {gradient.kind === "radial" && (
              <StudioSlider
                label={g("radialradius")}
                value={(gradient.radius ?? 0.5) * 100}
                resetValue={50}
                min={1}
                max={200}
                step={1}
                unit="%"
                identity={identity}
                invalidation={invalidation}
                onPreview={(radius) => change({ ...gradient, radius: radius / 100 }, false)}
                onCommit={(radius) => change({ ...gradient, radius: radius / 100 }, true)}
                onCancel={cancel}
              />
            )}
            {[0, gradient.stops.length - 1].map((index, at) => (
              <EffectColor
                key={index}
                identity={`${ownerId}:stop:${index}`}
                invalidation={invalidation}
                disabled={disabled}
                label={g("stopColor", { number: at + 1 })}
                value={gradient.stops[index]!.color}
                onPreview={(color) =>
                  change(
                    {
                      ...gradient,
                      stops: gradient.stops.map((stop, i) =>
                        i === index ? { ...stop, color } : stop,
                      ),
                    },
                    false,
                  )
                }
                onCommit={(color) =>
                  change(
                    {
                      ...gradient,
                      stops: gradient.stops.map((stop, i) =>
                        i === index ? { ...stop, color } : stop,
                      ),
                    },
                    true,
                  )
                }
                onCancel={cancel}
              />
            ))}
          </fieldset>
        </>
      )}
    </div>
  );
}
