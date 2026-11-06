import type { Effect, MotionInputKind } from "@musart/core";
import { useTranslation } from "react-i18next";
import { NumberInput } from "../../../shared/NumberInput";
import { SelectField } from "../../../shared/SelectField";
import { InfoTooltip } from "../../../shared/InfoTooltip";
import { DriverRangeFields, type DriverRange } from "./DriverRange";
import { effectPropertyLabel, motionPropertyKey, type EffectDriverProperty } from "./authoring";
const INPUTS: MotionInputKind[] = [
  "pointerX",
  "pointerY",
  "pointerXY",
  "pointerDrag",
  "primaryClick",
  "secondaryClick",
];
export function MotionSettings({
  effect,
  property,
  properties,
  secondary,
  outputRange,
  period,
  input,
  response,
  clickMode,
  returnOnRelease,
  disabled,
  setPropertyKey,
  setRange,
  setPeriod,
  setInput,
  setSecondaryKey,
  setResponse,
  setClickMode,
  setReturnOnRelease,
}: {
  effect: Effect;
  property: EffectDriverProperty;
  properties: EffectDriverProperty[];
  secondary?: EffectDriverProperty;
  outputRange: DriverRange;
  period: number;
  input: MotionInputKind;
  response: string;
  clickMode: string;
  returnOnRelease: boolean;
  disabled: boolean;
  setPropertyKey(this: void, value: string): void;
  setRange(this: void, value: { key: string; value: DriverRange }): void;
  setPeriod(this: void, value: number): void;
  setInput(this: void, value: MotionInputKind): void;
  setSecondaryKey(this: void, value: string): void;
  setResponse(this: void, value: string): void;
  setClickMode(this: void, value: string): void;
  setReturnOnRelease(this: void, value: boolean): void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="effect-motion-settings-help">
        <span>{t("effectMotion:settings")}</span>
        <InfoTooltip label={t("effectMotion:settings")}>
          {t("effectMotion:settingsHelp")}
        </InfoTooltip>
      </div>
      <SelectField
        contentClassName="effect-motion-select"
        label={t("effectMotion:property")}
        value={motionPropertyKey(property)}
        disabled={disabled}
        options={properties.map((item) => ({
          value: motionPropertyKey(item),
          label: t(effectPropertyLabel(effect, item), {
            defaultValue: item.target.property,
          }),
        }))}
        onValueChange={setPropertyKey}
      />
      <DriverRangeFields
        property={property}
        value={outputRange}
        disabled={disabled}
        onChange={(value) => setRange({ key: motionPropertyKey(property), value })}
      />
      <NumberInput
        label={t("effectMotion:period")}
        value={period}
        min={0.1}
        max={3600}
        step={0.1}
        unit="s"
        disabled={disabled}
        onCommit={setPeriod}
      />
      <SelectField
        contentClassName="effect-motion-select"
        label={t("effectMotion:input")}
        value={input}
        disabled={disabled}
        options={INPUTS.map((kind) => ({
          value: kind,
          label: t(`effectMotion:${kind}`),
        }))}
        onValueChange={(value) => setInput(value as MotionInputKind)}
      />
      {input === "pointerXY" && secondary && (
        <SelectField
          contentClassName="effect-motion-select"
          label={t("effectMotion:propertyY")}
          value={motionPropertyKey(secondary)}
          disabled={disabled}
          options={properties
            .filter((item) => item !== property)
            .map((item) => ({
              value: motionPropertyKey(item),
              label: t(effectPropertyLabel(effect, item), {
                defaultValue: item.target.property,
              }),
            }))}
          onValueChange={setSecondaryKey}
        />
      )}
      <SelectField
        contentClassName="effect-motion-select"
        label={t("effectMotion:response")}
        value={response}
        disabled={disabled}
        options={["direct", "smooth", "rebound"].map((value) => ({
          value,
          label: t(`effectMotion:${value}`),
        }))}
        onValueChange={setResponse}
      />
      {input.endsWith("Click") && (
        <SelectField
          contentClassName="effect-motion-select"
          label={t("effectMotion:clickMode")}
          value={clickMode}
          disabled={disabled}
          options={["impulse", "toggle"].map((value) => ({
            value,
            label: t(`effectMotion:${value}`),
          }))}
          onValueChange={setClickMode}
        />
      )}
      {input === "pointerDrag" && (
        <SelectField
          contentClassName="effect-motion-select"
          label={t("effectMotion:release")}
          value={returnOnRelease ? "return" : "hold"}
          disabled={disabled}
          options={["return", "hold"].map((value) => ({
            value,
            label: t(`effectMotion:${value}`),
          }))}
          onValueChange={(value) => setReturnOnRelease(value === "return")}
        />
      )}
    </>
  );
}
