import { useTranslation } from "react-i18next";
import type { FillGradient } from "@musart/core";
import { NumberInput } from "../../shared/NumberInput";
import { SelectField } from "../../shared/SelectField";
/** Portable radial paint fields share the same imperative gesture path as angle and stops. */
export function RadialControls({
  gradient,
  identity,
  disabled,
  preview,
  commit,
  cancel,
}: {
  gradient: FillGradient;
  identity: unknown;
  disabled: boolean;
  preview: (gradient: FillGradient) => void;
  commit: (gradient: FillGradient) => void;
  cancel: () => void;
}) {
  const { t } = useTranslation("gradient");
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <SelectField
        label={t("radialShape")}
        value={gradient.radialShape ?? "ellipse"}
        disabled={disabled}
        options={["ellipse", "circle"].map((value) => ({ value, label: t(`radial${value}`) }))}
        onValueChange={(value) =>
          commit({ ...gradient, radialShape: value as "ellipse" | "circle" })
        }
      />
      {(["centerX", "centerY", "radius"] as const).map((key) => (
        <NumberInput
          key={key}
          label={t(`radial${key}`)}
          identity={identity}
          value={(gradient[key] ?? 0.5) * 100}
          disabled={disabled}
          min={key === "radius" ? 1 : 0}
          max={key === "radius" ? 400 : 100}
          unit="%"
          step={1}
          onPreview={(value) => preview({ ...gradient, [key]: value / 100 })}
          onCommit={(value) => commit({ ...gradient, [key]: value / 100 })}
          onCancel={cancel}
        />
      ))}
    </div>
  );
}
