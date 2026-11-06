import { memo, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  createEffect,
  createLayerGeometryIndex,
  type Effect,
  type EnginePort,
  type Layer,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import type { PropertyActions } from "../TextProperties";
import { MotionNumberInput } from "../motion/MotionNumberInput";
import { MotionField } from "../motion/MotionField";
import { MotionValueField } from "../motion/MotionValueField";
import { EffectColor } from "../effects/EffectColor";
import { EffectParameters } from "../effects/EffectParameters";
import { Switch } from "../../ui/switch";
import "./messages";
import "./decoration-controls.css";

const hardShadowSettings = { offsetX: 8, offsetY: 8, radius: 0, shadowColor: "#000000" };
const hardShadowDefaults = { amount: 1, settings: hardShadowSettings };
const hardShadowParameterKeys = ["offsetX", "offsetY", "shadowColor", "amount"];
const RetainedEffectParameters = memo(EffectParameters);

function sameValues(
  before?: Readonly<Record<string, unknown>>,
  after?: Readonly<Record<string, unknown>>,
) {
  if (before === after) return true;
  if (!before || !after) return false;
  const keys = Object.keys(before);
  return (
    keys.length === Object.keys(after).length &&
    keys.every((key) => Object.hasOwn(after, key) && Object.is(before[key], after[key]))
  );
}
function sameParameters(before: Effect, after: Effect) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)] as (keyof Effect)[]);
  return [...keys].every((key) =>
    key === "enabled"
      ? true
      : key === "settings" || key === "inputs"
        ? sameValues(before[key], after[key])
        : Object.is(before[key], after[key]),
  );
}

/** Preserve visited controls across toggles; a disabled effect keeps its authored settings. */
function HardShadowParameters(props: ComponentProps<typeof EffectParameters>) {
  const [visited, setVisited] = useState(props.effect.enabled);
  const [effect, setEffect] = useState(() => ({ ...props.effect, enabled: true }));
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const callbacks = useMemo(
    () => ({
      onChange: (patch: Partial<Effect>, preview?: boolean) =>
        latest.current.onChange(patch, preview),
      onStart: () => latest.current.onStart?.(),
      onCancel: () => latest.current.onCancel?.(),
    }),
    [],
  );
  if (props.effect.enabled && !visited) setVisited(true);
  if (!sameParameters(effect, props.effect)) setEffect({ ...props.effect, enabled: true });
  if (!visited && !props.effect.enabled) return null;
  return (
    <div className="text-hard-shadow-parameters" hidden={!props.effect.enabled}>
      {/* Live fields retain canonical invalidation; the visible controls always edit an enabled effect. */}
      <RetainedEffectParameters
        {...props}
        {...callbacks}
        effect={props.engine ? effect : props.effect}
      />
    </div>
  );
}

/** Portable text paint and the existing GPU shadow effect share normal property gestures. */
export function TextDecorationControls({
  layer,
  engine,
  patch,
  preview,
  cancel,
}: PropertyActions & { layer: Layer; engine?: EnginePort }) {
  const { t } = useTranslation("textDecoration");
  const snapshot = engine?.getSnapshot(),
    page = snapshot?.project.pages.find((item) => item.id === snapshot.pageId),
    ancestors = page ? createLayerGeometryIndex(page).ancestors(layer.id) : [];
  if (
    layer.spatial?.enabled ||
    layer.spatialContext ||
    ancestors.some((parent) => parent.spatial?.enabled || parent.spatialContext)
  )
    return null;
  const shadow = layer.effects.find(
    (effect) => effect.type === "shadow" && effect.settings?.radius === 0,
  );
  function changeShadow(change: Partial<Effect>, draft = false) {
    if (!shadow) return;
    const effects = layer.effects.map((effect) =>
      effect.id === shadow.id ? { ...effect, ...change } : effect,
    );
    (draft ? preview : patch)({ effects });
  }
  return (
    <section className="inspector-section text-decoration-controls">
      <div className="section-title">
        <h3>{t("outline")}</h3>
      </div>
      <div className="text-decoration-width">
        <MotionNumberInput
          engine={engine}
          target={{ kind: "layer", layerId: layer.id, property: "strokeWidth" }}
          identity={layer}
          label={t("outlineWidth")}
          value={layer.strokeWidth}
          min={0}
          max={64}
          unit="px"
          resetValue={0}
          disabled={layer.locked}
          onPreview={(strokeWidth) => preview({ strokeWidth })}
          onCommit={(strokeWidth) => patch({ strokeWidth })}
          onCancel={cancel}
        />
      </div>
      <MotionField
        engine={engine}
        target={{ kind: "layer", layerId: layer.id, property: "stroke" }}
        label={t("outlineColor")}
        disabled={layer.locked}
      >
        <MotionValueField
          engine={engine}
          target={{ kind: "layer", layerId: layer.id, property: "stroke" }}
          fallback={layer.stroke}
        >
          {(stroke) => (
            <EffectColor
              paletteTargets={
                engine
                  ? [{ pageId: engine.getSnapshot().pageId, layerId: layer.id, property: "stroke" }]
                  : undefined
              }
              label={t("outlineColor")}
              identity={layer.id}
              value={String(stroke)}
              disabled={layer.locked}
              onPreview={(color) => preview({ stroke: color })}
              onCommit={(color) => patch({ stroke: color })}
              onCancel={cancel}
            />
          )}
        </MotionValueField>
      </MotionField>
      <label className="switch-row">
        <span>{t("hardShadow")}</span>
        <Switch
          aria-label={t("hardShadow")}
          checked={Boolean(shadow?.enabled)}
          disabled={layer.locked}
          onCheckedChange={(enabled) => {
            if (shadow) changeShadow({ enabled });
            else if (enabled)
              patch({
                effects: [
                  ...layer.effects,
                  createEffect("shadow", {
                    amount: 1,
                    settings: { ...hardShadowSettings },
                  }),
                ],
              });
          }}
        />
      </label>
      {shadow && (
        <HardShadowParameters
          key={shadow.id}
          engine={engine}
          layerId={layer.id}
          effect={shadow}
          disabled={layer.locked}
          parameterKeys={hardShadowParameterKeys}
          resetDefaults={hardShadowDefaults}
          onChange={changeShadow}
          onCancel={cancel}
        />
      )}
    </section>
  );
}
