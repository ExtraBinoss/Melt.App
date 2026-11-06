import { useTranslation } from "react-i18next";
import { type EnginePort, type Layer } from "@musart/core";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import type { useLayerPreview } from "../../../components/layers/controls/use-layer-preview";
import { StudioScaleInputs } from "./StudioScaleInputs";
import { StudioSlider } from "../controls/StudioSlider";

type Editor = ReturnType<typeof useLayerPreview>;
type Field = "x" | "y" | "z" | "rotationX" | "rotationY" | "rotationZ";

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
  const fields: Field[] = advanced ? ["x", "y", "z", "rotationZ"] : ["rotationY", "rotationX"];
  return (
    <>
      {advanced && (
        <StudioScaleInputs
          layer={layer}
          identity={identity}
          disabled={disabled}
          start={(axes) => {
            if (current())
              edit.start(
                axes.map((axis) => ({
                  kind: "layer",
                  layerId: layer.id,
                  property: `spatial.${axis}`,
                })),
              );
          }}
          preview={(spatial) => {
            if (current() && !disabled) edit.previewLayer({ spatial });
          }}
          commit={(spatial) => {
            if (current() && !disabled) edit.commit({ spatial });
          }}
          cancel={edit.cancel}
        />
      )}
      {fields.map((key) => {
        const rotation = key.startsWith("rotation");
        const axis = key.at(-1)!.toUpperCase();
        const label = t(rotation ? "rotationAxis" : "positionAxis", { axis });
        return (
          <StudioSlider
            key={key}
            identity={identity}
            invalidation={motionTimeChanges(engine)}
            label={label}
            value={spatial[key]}
            resetValue={0}
            min={Math.min(rotation ? -180 : -10, spatial[key])}
            max={Math.max(rotation ? 180 : 10, spatial[key])}
            step={rotation ? 1 : 0.01}
            unit={rotation ? "°" : undefined}
            disabled={disabled}
            onStart={() => {
              if (current())
                edit.start({ kind: "layer", layerId: layer.id, property: `spatial.${key}` });
            }}
            onPreview={(value) => {
              if (current() && !disabled)
                edit.previewLayer({ spatial: { ...spatial, [key]: value } });
            }}
            onCommit={(value) => {
              if (current() && !disabled) edit.commit({ spatial: { ...spatial, [key]: value } });
            }}
            onCancel={edit.cancel}
          />
        );
      })}
    </>
  );
}
