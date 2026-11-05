import { useTranslation } from "react-i18next";
import { SPATIAL_NUMBERS, type EnginePort, type Layer } from "@musart/core";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import type { useLayerPreview } from "../../../components/layers/controls/use-layer-preview";
import { StudioSlider } from "../controls/StudioSlider";

type Editor = ReturnType<typeof useLayerPreview>;
type Field =
  | "x"
  | "y"
  | "z"
  | "rotationX"
  | "rotationY"
  | "rotationZ"
  | "scaleX"
  | "scaleY"
  | "scaleZ";

/** Native transforms share the same preview transaction as extrusion and typography. */
export function StudioObjectTransform({
  engine,
  layer,
  identity,
  edit,
  current,
  disabled,
  advanced = false,
}: {
  engine: EnginePort;
  layer: Layer;
  identity: unknown;
  edit: Editor;
  current: () => boolean;
  disabled: boolean;
  advanced?: boolean;
}) {
  const { t } = useTranslation("spatial");
  const spatial = layer.spatial;
  if (!spatial?.enabled) return null;
  const fields: Field[] = advanced
    ? ["x", "y", "z", "rotationZ", "scaleX", "scaleY", "scaleZ"]
    : ["rotationY", "rotationX"];
  return fields.map((key) => {
    const rotation = key.startsWith("rotation"),
      scale = key.startsWith("scale");
    const axis = key.at(-1)!.toUpperCase();
    const label = t(rotation ? "rotationAxis" : scale ? "scaleAxis" : "positionAxis", { axis });
    return (
      <StudioSlider
        key={key}
        identity={identity}
        invalidation={motionTimeChanges(engine)}
        label={label}
        value={spatial[key]}
        min={scale ? SPATIAL_NUMBERS[key][0] : Math.min(rotation ? -180 : -10, spatial[key])}
        max={scale ? SPATIAL_NUMBERS[key][1] : Math.max(rotation ? 180 : 10, spatial[key])}
        step={rotation ? 1 : 0.01}
        unit={rotation ? "°" : undefined}
        disabled={disabled}
        onStart={() => {
          if (current())
            edit.start({ kind: "layer", layerId: layer.id, property: `spatial.${key}` });
        }}
        onPreview={(value) => {
          if (current() && !disabled) edit.previewLayer({ spatial: { ...spatial, [key]: value } });
        }}
        onCommit={(value) => {
          if (current() && !disabled) edit.commit({ spatial: { ...spatial, [key]: value } });
        }}
        onCancel={edit.cancel}
      />
    );
  });
}
