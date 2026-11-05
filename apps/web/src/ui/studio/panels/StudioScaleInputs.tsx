import { useState } from "react";
import { Link, Unlink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SPATIAL_NUMBERS, type Layer, type SpatialLayer } from "@musart/core";
import { NumberInput } from "../../../components/shared/NumberInput";
import { IconButton } from "../../../components/shared/IconButton";

const axes = ["scaleX", "scaleY", "scaleZ"] as const;
type Axis = (typeof axes)[number];

/** Preserve the authored proportions when linked; never progressively multiply a preview. */
export function scaledAxes(source: SpatialLayer, axis: Axis, value: number, linked: boolean) {
  const factor = value / source[axis];
  return Object.fromEntries(
    axes.map((key) => [
      key,
      Math.max(
        SPATIAL_NUMBERS[key][0],
        Math.min(
          SPATIAL_NUMBERS[key][1],
          linked ? source[key] * factor : key === axis ? value : source[key],
        ),
      ),
    ]),
  ) as Pick<SpatialLayer, Axis>;
}

export function StudioScaleInputs({
  layer,
  identity,
  disabled,
  start,
  preview,
  commit,
  cancel,
}: {
  layer: Layer;
  identity: unknown;
  disabled: boolean;
  start: (axes: readonly Axis[]) => void;
  preview: (spatial: SpatialLayer) => void;
  commit: (spatial: SpatialLayer) => void;
  cancel: () => void;
}) {
  const [linked, setLinked] = useState(true);
  const { t } = useTranslation("studioChrome");
  const { t: spatialText } = useTranslation("spatial");
  const source = layer.spatial!;
  return (
    <div className="studio-scale-inputs" role="group" aria-label={spatialText("scale")}>
      {axes.map((axis) => {
        const ratioMin = Math.max(...axes.map((key) => SPATIAL_NUMBERS[key][0] / source[key]));
        const ratioMax = Math.min(...axes.map((key) => SPATIAL_NUMBERS[key][1] / source[key]));
        return (
          <NumberInput
            key={axis}
            identity={identity}
            label={spatialText("scaleAxis", { axis: axis.at(-1) })}
            scrubLabel={axis.at(-1)}
            value={source[axis]}
            min={linked ? source[axis] * ratioMin : SPATIAL_NUMBERS[axis][0]}
            max={linked ? source[axis] * ratioMax : SPATIAL_NUMBERS[axis][1]}
            step={0.01}
            resetValue={1}
            disabled={disabled}
            onStart={() => start(linked ? axes : [axis])}
            onPreview={(value) =>
              preview({ ...source, ...scaledAxes(source, axis, value, linked) })
            }
            onCommit={(value) => commit({ ...source, ...scaledAxes(source, axis, value, linked) })}
            onCancel={cancel}
          />
        );
      })}
      <IconButton
        label={t(linked ? "unlinkScale" : "linkScale")}
        active={linked}
        disabled={disabled}
        tooltipSide="top"
        onClick={() => {
          cancel();
          setLinked(!linked);
        }}
      >
        {linked ? <Link size={15} /> : <Unlink size={15} />}
      </IconButton>
    </div>
  );
}
