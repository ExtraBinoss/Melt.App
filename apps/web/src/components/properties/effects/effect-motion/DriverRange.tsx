import type { Effect, MotionValue } from "@musart/core";
import { useTranslation } from "react-i18next";
import { NumberInput } from "../../../shared/NumberInput";
import { SelectField } from "../../../shared/SelectField";
import { Input } from "../../../ui/input";
import { effectPropertyOptionLabel, type EffectDriverProperty } from "./authoring";

export type DriverRange = readonly [MotionValue, MotionValue];
/** Authoring values stay local until one validated block transaction is added. */
export function DriverRangeFields({
  effect,
  property,
  value,
  disabled,
  onChange,
}: {
  effect: Effect;
  property: EffectDriverProperty;
  value: DriverRange;
  disabled: boolean;
  onChange(this: void, value: DriverRange): void;
}) {
  const { t } = useTranslation("effectMotion");
  return (
    <div className="effect-motion-range">
      {([0, 1] as const).map((index) => {
        const label = t(index === 0 ? "from" : "to");
        const change = (next: MotionValue) =>
          onChange(index === 0 ? [next, value[1]] : [value[0], next]);
        if (property.kind === "number" || property.kind === "integer")
          return (
            <NumberInput
              key={index}
              label={label}
              value={Number(value[index])}
              min={property.min}
              max={property.max}
              step={property.kind === "integer" ? 1 : 0.01}
              decimalScale={property.kind === "integer" ? 0 : 2}
              disabled={disabled}
              onCommit={change}
            />
          );
        if (property.kind === "choice" || property.kind === "boolean")
          return (
            <SelectField
              contentClassName="effect-motion-select"
              key={index}
              label={label}
              value={String(value[index])}
              disabled={disabled}
              options={(property.kind === "boolean" ? ["false", "true"] : property.options).map(
                (item) => ({
                  value: item,
                  label:
                    property.kind === "boolean"
                      ? t(item)
                      : t(effectPropertyOptionLabel(effect, property, item), { ns: "translation" }),
                }),
              )}
              onValueChange={(next) => change(property.kind === "boolean" ? next === "true" : next)}
            />
          );
        return (
          <label key={index} className="effect-motion-value">
            <span>{label}</span>
            <Input
              type={property.kind === "color" ? "color" : "text"}
              aria-label={label}
              value={String(value[index])}
              disabled={disabled}
              maxLength={property.kind === "string" ? property.maxLength : undefined}
              onChange={(event) => change(event.currentTarget.value)}
            />
          </label>
        );
      })}
    </div>
  );
}
